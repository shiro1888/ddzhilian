import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type JavaDockerRunnerConfig = {
  enabled: boolean;
  dockerImage: string;
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  maxSourceBytes: number;
  maxStdinBytes: number;
  maxOutputBytes: number;
};

export type JavaDockerRunRequest = {
  source: string;
  stdin?: string;
  config: JavaDockerRunnerConfig;
};

export type JavaDockerRunResult = {
  ok: boolean;
  language: 'java';
  sandbox: 'docker-java';
  exitCode: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  stdout: string;
  stderr: string;
  blocked: string[];
  violations: [];
  timedOut: boolean;
  outputTruncated: boolean;
  compileFailed: boolean;
  result: {
    lines: string[];
    text: string;
    parsedJson: unknown | null;
  };
};

export type JavaSourcePreparation =
  | {
      ok: true;
      mainClassName: string;
      sourceFileName: string;
    }
  | {
      ok: false;
      error: string;
    };

const javaIdentifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const javaPackagePattern = /^\s*package\s+[\w.]+\s*;/m;
const javaMainMethodPattern =
  /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(?:\[\s*\]\s*[A-Za-z_$][A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*\s*\[\s*\])\s*\)/m;

export function prepareJavaSourceForDocker(source: string): JavaSourcePreparation {
  const searchableSource = stripJavaComments(source);

  if (javaPackagePattern.test(searchableSource)) {
    return {
      ok: false,
      error: '暂不支持 package 声明，请使用默认包。',
    };
  }

  const mainClassName = detectJavaMainClassName(searchableSource);
  if (!javaIdentifierPattern.test(mainClassName)) {
    return {
      ok: false,
      error: '无法识别可运行的 Java 主类名。',
    };
  }

  return {
    ok: true,
    mainClassName,
    sourceFileName: `${mainClassName}.java`,
  };
}

export function detectJavaMainClassName(source: string) {
  const publicClassMatch = source.match(
    /\bpublic\s+(?:(?:final|abstract)\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
  );
  if (publicClassMatch?.[1]) {
    return publicClassMatch[1];
  }

  const mainMethodIndex = source.search(javaMainMethodPattern);
  if (mainMethodIndex >= 0) {
    const classPattern = /\b(?:(?:final|abstract)\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
    let lastClassName = '';
    let match: RegExpExecArray | null;

    while ((match = classPattern.exec(source))) {
      if (match.index > mainMethodIndex) {
        break;
      }

      lastClassName = match[1];
    }

    if (lastClassName) {
      return lastClassName;
    }
  }

  return 'Main';
}

export async function runJavaInDockerSandbox({
  source,
  stdin = '',
  config,
}: JavaDockerRunRequest): Promise<JavaDockerRunResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const preparedSource = prepareJavaSourceForDocker(source);

  if (!preparedSource.ok) {
    return createJavaDockerRunResult({
      started,
      startedAt,
      exitCode: 1,
      stdout: '',
      stderr: preparedSource.error,
    });
  }

  let workDir = '';

  try {
    workDir = await mkdtemp(join(tmpdir(), 'ddzhilian-java-'));
    await writeFile(join(workDir, preparedSource.sourceFileName), source, 'utf8');

    return await runDockerContainer({
      workDir,
      sourceFileName: preparedSource.sourceFileName,
      mainClassName: preparedSource.mainClassName,
      stdin,
      config,
      started,
      startedAt,
    });
  } catch (error) {
    return createJavaDockerRunResult({
      started,
      startedAt,
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? `Java 沙箱执行失败：${error.message}` : 'Java 沙箱执行失败。',
    });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

function runDockerContainer({
  workDir,
  sourceFileName,
  mainClassName,
  stdin,
  config,
  started,
  startedAt,
}: {
  workDir: string;
  sourceFileName: string;
  mainClassName: string;
  stdin: string;
  config: JavaDockerRunnerConfig;
  started: number;
  startedAt: string;
}) {
  return new Promise<JavaDockerRunResult>((resolve) => {
    const containerName = `ddz-java-${randomUUID()}`;
    const dockerArgs = buildDockerArgs({
      containerName,
      workDir,
      sourceFileName,
      mainClassName,
      config,
    });
    const child = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timedOut = false;
    let outputTruncated = false;
    let settled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const stopContainer = () => {
      forceRemoveContainer(containerName);
      child.kill('SIGKILL');
    };

    const appendOutput = (channel: 'stdout' | 'stderr', chunk: Buffer) => {
      if (outputTruncated) {
        return;
      }

      const remainingBytes = config.maxOutputBytes - outputBytes;
      if (remainingBytes <= 0) {
        outputTruncated = true;
        stderr = appendLine(stderr, '沙箱输出超过限制，已截断并终止。');
        stopContainer();
        return;
      }

      const acceptedChunk =
        chunk.byteLength <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes);
      const text = acceptedChunk.toString('utf8');

      if (channel === 'stdout') {
        stdout += text;
      } else {
        stderr += text;
      }

      outputBytes += acceptedChunk.byteLength;

      if (chunk.byteLength > remainingBytes) {
        outputTruncated = true;
        stderr = appendLine(stderr, '沙箱输出超过限制，已截断并终止。');
        stopContainer();
      }
    };

    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const normalizedExitCode = timedOut ? 124 : exitCode ?? 1;
      const nextStderr = timedOut
        ? appendLine(stderr, `沙箱超时：执行超过 ${config.timeoutMs.toString()}ms，已终止。`)
        : stderr;

      resolve(createJavaDockerRunResult({
        started,
        startedAt,
        exitCode: normalizedExitCode,
        stdout,
        stderr: nextStderr,
        timedOut,
        outputTruncated,
      }));
    };

    child.on('error', () => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve(createJavaDockerRunResult({
        started,
        startedAt,
        exitCode: 127,
        stdout: '',
        stderr: `Java Docker 沙箱启动失败：服务器无法调用 docker。请确认 Docker 已安装、服务已启动，并已拉取镜像 ${config.dockerImage}。`,
      }));
    });

    child.stdout.on('data', (chunk: Buffer) => appendOutput('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => appendOutput('stderr', chunk));
    child.stdin.on('error', () => {
      // The container may exit during compilation before stdin is consumed.
    });
    child.on('close', (exitCode) => finish(exitCode));

    timeoutId = setTimeout(() => {
      timedOut = true;
      stopContainer();
    }, config.timeoutMs);

    child.stdin.end(stdin);
  });
}

function buildDockerArgs({
  containerName,
  workDir,
  sourceFileName,
  mainClassName,
  config,
}: {
  containerName: string;
  workDir: string;
  sourceFileName: string;
  mainClassName: string;
  config: JavaDockerRunnerConfig;
}) {
  const javaCommand = [
    'javac',
    '-encoding',
    'UTF-8',
    quoteShellToken(sourceFileName),
    '&&',
    'java',
    '-Djava.io.tmpdir=/tmp',
    quoteShellToken(mainClassName),
  ].join(' ');

  return [
    'run',
    '--rm',
    '--pull=never',
    '--name',
    containerName,
    '--network',
    'none',
    '--memory',
    `${config.memoryMb.toString()}m`,
    '--memory-swap',
    `${config.memoryMb.toString()}m`,
    '--cpus',
    config.cpus.toString(),
    '--pids-limit',
    config.pidsLimit.toString(),
    '--ulimit',
    'nofile=64:64',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,noexec,size=16m',
    '--mount',
    `type=bind,source=${workDir},target=/workspace`,
    '--workdir',
    '/workspace',
    config.dockerImage,
    'sh',
    '-lc',
    javaCommand,
  ];
}

function forceRemoveContainer(containerName: string) {
  const child = spawn('docker', ['rm', '-f', containerName], {
    stdio: 'ignore',
  });

  child.on('error', () => {
    // Cleanup is best effort after the main docker process has already failed or timed out.
  });
  child.unref();
}

function createJavaDockerRunResult({
  started,
  startedAt,
  exitCode,
  stdout,
  stderr,
  timedOut = false,
  outputTruncated = false,
}: {
  started: number;
  startedAt: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  outputTruncated?: boolean;
}): JavaDockerRunResult {
  const finished = Date.now();

  return {
    ok: exitCode === 0 && !timedOut && !outputTruncated,
    language: 'java',
    sandbox: 'docker-java',
    exitCode,
    durationMs: finished - started,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    stdout,
    stderr,
    blocked: [],
    violations: [],
    timedOut,
    outputTruncated,
    compileFailed: !timedOut && exitCode !== 0 && isCompileFailure(stderr),
    result: {
      lines: stdout.trimEnd() ? stdout.trimEnd().split('\n') : [],
      text: stdout,
      parsedJson: parseStdoutJson(stdout),
    },
  };
}

function stripJavaComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

function quoteShellToken(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function appendLine(value: string, line: string) {
  return value.trimEnd() ? `${value.trimEnd()}\n${line}` : line;
}

function isCompileFailure(stderr: string) {
  return /(?:\.java:\d+:|error:|错误:)/i.test(stderr);
}

function parseStdoutJson(stdout: string): unknown | null {
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    return null;
  }

  try {
    return JSON.parse(trimmedStdout) as unknown;
  } catch {
    const lastJsonLine = trimmedStdout
      .split('\n')
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.startsWith('{') || line.startsWith('['));

    if (!lastJsonLine) {
      return null;
    }

    try {
      return JSON.parse(lastJsonLine) as unknown;
    } catch {
      return null;
    }
  }
}
