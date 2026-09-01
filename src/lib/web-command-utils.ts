import type { WebCommandLanguage, WebCommandRunResult } from '../app/web-command-sandbox'

export const languageLabels: Record<WebCommandLanguage, string> = {
  python: 'Python',
  java: 'Java',
  c: 'C',
  plantuml: 'PlantUML',
}

export const supportedLanguages: WebCommandLanguage[] = ['python', 'java', 'c', 'plantuml']
export const plantUmlAutoRenderDelayMs = 5000

export function getEditorFilename(language: WebCommandLanguage) {
  switch (language) {
    case 'python':
      return 'main.py'
    case 'java':
      return 'Main.java'
    case 'c':
      return 'main.c'
    case 'plantuml':
      return 'diagram.puml'
  }
}

export function getCopyDefaultLabel(language: WebCommandLanguage) {
  return language === 'plantuml' ? '复制图片' : '复制结果'
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back to the legacy textarea path below for older browsers or denied permissions.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  let copied = false
  try {
    document.body.appendChild(textarea)
    textarea.select()
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }

  if (!copied) {
    throw new Error('当前浏览器不支持剪贴板写入。')
  }
}

export function resolveWebCommandApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SIGNALING_HTTP_URL?.trim() || ''

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8787'
  }

  return `${protocol}//${host}`
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function readWebCommandApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : fallback
}

export function buildServerSandboxHeaders(historyAuthToken?: string) {
  const token = historyAuthToken?.trim()
  if (!token) {
    throw new Error('连接凭证还没准备好，请等待 DD直连显示在线后再运行服务端沙箱。')
  }

  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
}

export async function runJavaDockerSandbox({
  source,
  stdin,
  historyAuthToken,
}: {
  source: string
  stdin: string
  historyAuthToken?: string
}) {
  const response = await fetch(`${resolveWebCommandApiBaseUrl()}/api/web-command/java`, {
    method: 'POST',
    headers: buildServerSandboxHeaders(historyAuthToken),
    body: JSON.stringify({ source, stdin }),
  })

  if (!response.ok) {
    throw new Error(await readWebCommandApiError(response, 'Java 沙箱请求失败。'))
  }

  return normalizeJavaRunResult(await response.json())
}

export async function runPlantUmlDockerSandbox({
  source,
  historyAuthToken,
}: {
  source: string
  historyAuthToken?: string
}) {
  const response = await fetch(`${resolveWebCommandApiBaseUrl()}/api/web-command/plantuml`, {
    method: 'POST',
    headers: buildServerSandboxHeaders(historyAuthToken),
    body: JSON.stringify({ source }),
  })

  if (!response.ok) {
    throw new Error(await readWebCommandApiError(response, 'PlantUML 渲染失败。'))
  }

  return normalizePlantUmlRunResult(await response.json())
}

export function normalizeJavaRunResult(payload: unknown): WebCommandRunResult {
  const resultPayload = isObjectRecord(payload) ? payload : {}
  const stdout = typeof resultPayload.stdout === 'string' ? resultPayload.stdout : ''
  const stderr = typeof resultPayload.stderr === 'string' ? resultPayload.stderr : ''
  const exitCode = typeof resultPayload.exitCode === 'number'
    ? resultPayload.exitCode
    : resultPayload.ok === true ? 0 : 1
  const startedAt = typeof resultPayload.startedAt === 'string'
    ? resultPayload.startedAt
    : new Date().toISOString()
  const finishedAt = typeof resultPayload.finishedAt === 'string'
    ? resultPayload.finishedAt
    : new Date().toISOString()
  const result = isObjectRecord(resultPayload.result) ? resultPayload.result : {}
  const lines = Array.isArray(result.lines)
    ? result.lines.filter((line): line is string => typeof line === 'string')
    : stdout.trimEnd() ? stdout.trimEnd().split('\n') : []

  return {
    ok: resultPayload.ok === true,
    language: 'java',
    sandbox: 'docker-java',
    exitCode,
    durationMs: typeof resultPayload.durationMs === 'number' ? resultPayload.durationMs : 0,
    startedAt,
    finishedAt,
    stdout,
    stderr,
    blocked: [],
    violations: [],
    timedOut: resultPayload.timedOut === true,
    outputTruncated: resultPayload.outputTruncated === true,
    compileFailed: resultPayload.compileFailed === true,
    result: {
      lines,
      text: typeof result.text === 'string' ? result.text : stdout,
      parsedJson: 'parsedJson' in result ? result.parsedJson : null,
    },
  }
}

export function normalizePlantUmlRunResult(payload: unknown): WebCommandRunResult {
  const resultPayload = isObjectRecord(payload) ? payload : {}
  const imagePayload = isObjectRecord(resultPayload.image) ? resultPayload.image : null
  const image = typeof imagePayload?.dataUrl === 'string'
    && imagePayload.dataUrl.startsWith('data:image/png;base64,')
    ? {
        format: 'png' as const,
        mimeType: 'image/png' as const,
        dataUrl: imagePayload.dataUrl,
        sizeBytes: typeof imagePayload.sizeBytes === 'number' ? imagePayload.sizeBytes : 0,
      }
    : undefined
  const stdout = typeof resultPayload.stdout === 'string' ? resultPayload.stdout : ''
  const stderr = typeof resultPayload.stderr === 'string' ? resultPayload.stderr : ''
  const exitCode = typeof resultPayload.exitCode === 'number'
    ? resultPayload.exitCode
    : resultPayload.ok === true ? 0 : 1

  return {
    ok: resultPayload.ok === true,
    language: 'plantuml',
    sandbox: 'docker-plantuml',
    exitCode,
    durationMs: typeof resultPayload.durationMs === 'number' ? resultPayload.durationMs : 0,
    startedAt: typeof resultPayload.startedAt === 'string'
      ? resultPayload.startedAt
      : new Date().toISOString(),
    finishedAt: typeof resultPayload.finishedAt === 'string'
      ? resultPayload.finishedAt
      : new Date().toISOString(),
    stdout,
    stderr,
    blocked: [],
    violations: [],
    timedOut: resultPayload.timedOut === true,
    outputTruncated: resultPayload.outputTruncated === true,
    image,
    result: {
      lines: [],
      text: '',
      parsedJson: null,
    },
  }
}

export function createWebCommandErrorResult({
  language,
  started,
  error,
}: {
  language: WebCommandLanguage
  started: number
  error: unknown
}): WebCommandRunResult {
  const finished = Date.now()
  const message = error instanceof Error ? error.message : '运行失败。'

  return {
    ok: false,
    language,
    sandbox: language === 'java'
      ? 'docker-java'
      : language === 'plantuml' ? 'docker-plantuml' : 'browser-output-sandbox',
    exitCode: 1,
    durationMs: finished - started,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    stdout: '',
    stderr: message,
    blocked: [],
    violations: [],
    result: {
      lines: [],
      text: '',
      parsedJson: null,
    },
  }
}
