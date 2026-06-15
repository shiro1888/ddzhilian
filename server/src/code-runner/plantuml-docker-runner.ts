import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type PlantUmlDockerRunnerConfig = {
  enabled: boolean;
  dockerImage: string;
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  maxSourceBytes: number;
  maxOutputBytes: number;
};

export type PlantUmlDockerRunRequest = {
  source: string;
  config: PlantUmlDockerRunnerConfig;
};

export type PlantUmlDockerRunResult = {
  ok: boolean;
  language: 'plantuml';
  sandbox: 'docker-plantuml';
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
  image?: {
    format: 'png';
    mimeType: 'image/png';
    dataUrl: string;
    sizeBytes: number;
  };
  result: {
    lines: string[];
    text: string;
    parsedJson: null;
  };
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPngBuffer(buffer: Buffer) {
  return buffer.length >= pngSignature.length && pngSignature.every((byte, index) => buffer[index] === byte);
}

export async function runPlantUmlInDockerSandbox({
  source,
  config,
}: PlantUmlDockerRunRequest): Promise<PlantUmlDockerRunResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  return runDockerContainer({
    source,
    config,
    started,
    startedAt,
  });
}

function runDockerContainer({
  source,
  config,
  started,
  startedAt,
}: {
  source: string;
  config: PlantUmlDockerRunnerConfig;
  started: number;
  startedAt: string;
}) {
  return new Promise<PlantUmlDockerRunResult>((resolve) => {
    const containerName = `ddz-plantuml-${randomUUID()}`;
    const child = spawn('docker', buildDockerArgs({ containerName, config }), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
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

    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const normalizedExitCode = timedOut ? 124 : exitCode ?? 1;
      let nextStderr = timedOut
        ? appendLine(stderr, `PlantUML 沙箱超时：执行超过 ${config.timeoutMs.toString()}ms，已终止。`)
        : stderr;

      if (normalizedExitCode === 0 && !timedOut && !outputTruncated && !isPngBuffer(stdoutBuffer)) {
        nextStderr = appendLine(nextStderr, 'PlantUML 没有返回有效 PNG 图片。');
        resolve(createPlantUmlDockerRunResult({
          started,
          startedAt,
          exitCode: 1,
          stderr: nextStderr,
          timedOut,
          outputTruncated,
        }));
        return;
      }

      resolve(createPlantUmlDockerRunResult({
        started,
        startedAt,
        exitCode: normalizedExitCode,
        stderr: nextStderr,
        timedOut,
        outputTruncated,
        imageBuffer: normalizedExitCode === 0 && !timedOut && !outputTruncated ? stdoutBuffer : undefined,
      }));
    };

    const appendStdout = (chunk: Buffer) => {
      if (outputTruncated) {
        return;
      }

      const remainingBytes = config.maxOutputBytes - outputBytes;
      if (remainingBytes <= 0) {
        outputTruncated = true;
        stderr = appendLine(stderr, 'PlantUML 图片超过输出大小限制，已截断并终止。');
        stopContainer();
        return;
      }

      const acceptedChunk =
        chunk.byteLength <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes);
      stdoutChunks.push(acceptedChunk);
      outputBytes += acceptedChunk.byteLength;

      if (chunk.byteLength > remainingBytes) {
        outputTruncated = true;
        stderr = appendLine(stderr, 'PlantUML 图片超过输出大小限制，已截断并终止。');
        stopContainer();
      }
    };

    child.on('error', () => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve(createPlantUmlDockerRunResult({
        started,
        startedAt,
        exitCode: 127,
        stderr: `PlantUML Docker 沙箱启动失败：服务器无法调用 docker。请确认 Docker 已安装、服务已启动，并已拉取镜像 ${config.dockerImage}。`,
      }));
    });

    child.stdout.on('data', appendStdout);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.stdin.on('error', () => {
      // The container may exit before stdin is fully consumed when PlantUML rejects input.
    });
    child.on('close', (exitCode) => finish(exitCode));

    timeoutId = setTimeout(() => {
      timedOut = true;
      stopContainer();
    }, config.timeoutMs);

    child.stdin.end(source);
  });
}

function buildDockerArgs({
  containerName,
  config,
}: {
  containerName: string;
  config: PlantUmlDockerRunnerConfig;
}) {
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
    '/tmp:rw,nosuid,nodev,size=64m',
    config.dockerImage,
    '-pipe',
    '-tpng',
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

function createPlantUmlDockerRunResult({
  started,
  startedAt,
  exitCode,
  stderr,
  timedOut = false,
  outputTruncated = false,
  imageBuffer,
}: {
  started: number;
  startedAt: string;
  exitCode: number;
  stderr: string;
  timedOut?: boolean;
  outputTruncated?: boolean;
  imageBuffer?: Buffer;
}): PlantUmlDockerRunResult {
  const finished = Date.now();
  const image = imageBuffer
    ? {
        format: 'png' as const,
        mimeType: 'image/png' as const,
        dataUrl: `data:image/png;base64,${imageBuffer.toString('base64')}`,
        sizeBytes: imageBuffer.byteLength,
      }
    : undefined;

  return {
    ok: exitCode === 0 && !timedOut && !outputTruncated && Boolean(image),
    language: 'plantuml',
    sandbox: 'docker-plantuml',
    exitCode,
    durationMs: finished - started,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    stdout: '',
    stderr,
    blocked: [],
    violations: [],
    timedOut,
    outputTruncated,
    image,
    result: {
      lines: [],
      text: '',
      parsedJson: null,
    },
  };
}

function appendLine(value: string, line: string) {
  return value.trimEnd() ? `${value.trimEnd()}\n${line}` : line;
}
