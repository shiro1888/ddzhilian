import type { IncomingMessage, ServerResponse } from 'node:http';

import { runJavaInDockerSandbox } from '../code-runner/java-docker-runner.js';
import { runPlantUmlInDockerSandbox } from '../code-runner/plantuml-docker-runner.js';
import {
  RequestBodyTooLargeError,
  isObjectRecord,
  readRequestBuffer,
  writeJson,
} from '../http/utils.js';

type JavaSandboxConfig = Parameters<typeof runJavaInDockerSandbox>[0]['config'];
type PlantUmlSandboxConfig = Parameters<typeof runPlantUmlInDockerSandbox>[0]['config'];

export type WebCommandHandlerDeps = {
  config: {
    javaDockerSandbox: JavaSandboxConfig;
    plantUmlDockerSandbox: PlantUmlSandboxConfig;
  };
  authenticateHistoryRequest: typeof import('../index.js').authenticateHistoryRequest;
};

const MAX_CONCURRENT_JAVA_SANDBOX_RUNS = 4;
const MAX_CONCURRENT_PLANTUML_SANDBOX_RUNS = 4;
let activeJavaSandboxRuns = 0;
let activePlantUmlSandboxRuns = 0;

export async function handleWebCommandJavaRunRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: WebCommandHandlerDeps,
) {
  const { config, authenticateHistoryRequest } = deps;

  if (!config.javaDockerSandbox.enabled) {
    writeJson(response, 503, {
      error: 'Java Docker 沙箱未启用。生产环境需要显式设置 JAVA_DOCKER_SANDBOX_ENABLED=true。',
    });
    return;
  }

  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  if (activeJavaSandboxRuns >= MAX_CONCURRENT_JAVA_SANDBOX_RUNS) {
    writeJson(response, 429, { error: 'Java 沙箱当前并发已达上限，请稍后重试。' });
    return;
  }

  activeJavaSandboxRuns += 1;
  try {
    const maxPayloadBytes =
      config.javaDockerSandbox.maxSourceBytes +
      config.javaDockerSandbox.maxStdinBytes +
      4096;
    let payload: unknown;

    try {
      const buffer = await readRequestBuffer(request, { maxBytes: maxPayloadBytes });
      payload = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch (error) {
      writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
        error: error instanceof RequestBodyTooLargeError
          ? 'Java 运行请求超过大小限制。'
          : 'Invalid Java run JSON.',
      });
      return;
    }

    if (!isObjectRecord(payload)) {
      writeJson(response, 400, { error: 'Invalid Java run payload.' });
      return;
    }

    const source = payload.source;
    const stdin = payload.stdin;

    if (typeof source !== 'string' || !source.trim()) {
      writeJson(response, 400, { error: 'Java 源码不能为空。' });
      return;
    }

    if (stdin !== undefined && typeof stdin !== 'string') {
      writeJson(response, 400, { error: 'Java stdin 必须是字符串。' });
      return;
    }

    if (Buffer.byteLength(source, 'utf8') > config.javaDockerSandbox.maxSourceBytes) {
      writeJson(response, 413, {
        error: `Java 源码不能超过 ${config.javaDockerSandbox.maxSourceBytes.toString()} bytes。`,
      });
      return;
    }

    const normalizedStdin = stdin ?? '';
    if (Buffer.byteLength(normalizedStdin, 'utf8') > config.javaDockerSandbox.maxStdinBytes) {
      writeJson(response, 413, {
        error: `Java 标准输入不能超过 ${config.javaDockerSandbox.maxStdinBytes.toString()} bytes。`,
      });
      return;
    }

    const result = await runJavaInDockerSandbox({
      source,
      stdin: normalizedStdin,
      config: config.javaDockerSandbox,
    });

    writeJson(response, 200, result as unknown as Record<string, unknown>);
  } finally {
    activeJavaSandboxRuns -= 1;
  }
}

export async function handleWebCommandPlantUmlRunRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: WebCommandHandlerDeps,
) {
  const { config, authenticateHistoryRequest } = deps;

  if (!config.plantUmlDockerSandbox.enabled) {
    writeJson(response, 503, {
      error: 'PlantUML Docker 沙箱未启用。生产环境需要显式设置 PLANTUML_DOCKER_SANDBOX_ENABLED=true。',
    });
    return;
  }

  const authResult = authenticateHistoryRequest(request);
  if (!authResult.ok) {
    writeJson(response, authResult.statusCode, { error: authResult.message });
    return;
  }

  if (activePlantUmlSandboxRuns >= MAX_CONCURRENT_PLANTUML_SANDBOX_RUNS) {
    writeJson(response, 429, { error: 'PlantUML 沙箱当前并发已达上限，请稍后重试。' });
    return;
  }

  activePlantUmlSandboxRuns += 1;
  try {
    let payload: unknown;

    try {
      const buffer = await readRequestBuffer(request, {
        maxBytes: config.plantUmlDockerSandbox.maxSourceBytes + 1024,
      });
      payload = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch (error) {
      writeJson(response, error instanceof RequestBodyTooLargeError ? 413 : 400, {
        error: error instanceof RequestBodyTooLargeError
          ? 'PlantUML 渲染请求超过大小限制。'
          : 'Invalid PlantUML render JSON.',
      });
      return;
    }

    if (!isObjectRecord(payload)) {
      writeJson(response, 400, { error: 'Invalid PlantUML render payload.' });
      return;
    }

    const source = payload.source;
    if (typeof source !== 'string' || !source.trim()) {
      writeJson(response, 400, { error: 'PlantUML 源码不能为空。' });
      return;
    }

    if (Buffer.byteLength(source, 'utf8') > config.plantUmlDockerSandbox.maxSourceBytes) {
      writeJson(response, 413, {
        error: `PlantUML 源码不能超过 ${config.plantUmlDockerSandbox.maxSourceBytes.toString()} bytes。`,
      });
      return;
    }

    const result = await runPlantUmlInDockerSandbox({
      source,
      config: config.plantUmlDockerSandbox,
    });

    writeJson(response, 200, result as unknown as Record<string, unknown>);
  } finally {
    activePlantUmlSandboxRuns -= 1;
  }
}
