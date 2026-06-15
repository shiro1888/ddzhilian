export type WebCommandLanguage = 'python' | 'java' | 'c' | 'plantuml'

export type WebCommandRunRequest = {
  language: WebCommandLanguage
  source: string
  stdin?: string
}

export type WebCommandRunResult = {
  ok: boolean
  language: WebCommandLanguage
  sandbox: 'browser-output-sandbox' | 'docker-java' | 'docker-plantuml'
  exitCode: number
  durationMs: number
  startedAt: string
  finishedAt: string
  stdout: string
  stderr: string
  blocked: string[]
  violations: WebCommandSecurityViolation[]
  timedOut?: boolean
  outputTruncated?: boolean
  compileFailed?: boolean
  image?: {
    format: 'png'
    mimeType: 'image/png'
    dataUrl: string
    sizeBytes: number
  }
  result: {
    lines: string[]
    text: string
    parsedJson: unknown | null
  }
}

type SecurityRule = {
  pattern: RegExp
  message: string
}

export type WebCommandSecurityViolation = {
  message: string
  snippet: string
}

const sourceMaxLength = 12000

export const webCommandDefaultSources: Record<WebCommandLanguage, string> = {
  python: [
    'print("hello from python")',
    'print("answer =", 40 + 2)',
  ].join('\n'),
  java: [
    'import java.util.HashSet;',
    'import java.util.Iterator;',
    '',
    'public class HashSetDemo {',
    '  public static void main(String[] args) {',
    '    HashSet<String> set = new HashSet<>();',
    '    set.add("Java");',
    '    set.add("Python");',
    '    set.add("TypeScript");',
    '    set.add("C++");',
    '',
    '    Iterator<String> iterator = set.iterator();',
    '    System.out.println("HashSet 遍历结果：");',
    '    while (iterator.hasNext()) {',
    '      String element = iterator.next();',
    '      System.out.println(element);',
    '    }',
    '  }',
    '}',
  ].join('\n'),
  c: [
    '#include <stdio.h>',
    '',
    'int main(void) {',
    '  puts("hello from c");',
    '  printf("answer = %d\\n", 40 + 2);',
    '  return 0;',
    '}',
  ].join('\n'),
  plantuml: [
    '@startuml',
    'actor 用户',
    'participant Web命令行 as Web',
    'participant Docker沙箱 as Sandbox',
    '',
    '用户 -> Web: 输入 PlantUML',
    'Web -> Sandbox: 渲染图片',
    'Sandbox --> Web: PNG',
    'Web --> 用户: 显示图片',
    '@enduml',
  ].join('\n'),
}

const securityRules: Record<WebCommandLanguage, SecurityRule[]> = {
  python: [
    {
      pattern: /^\s*(?:from|import)\s+(?:os|sys|subprocess|socket|pathlib|shutil|ctypes|requests|urllib|http|ftplib|asyncio|builtins|importlib|multiprocessing|threading|pickle|marshal)\b/im,
      message: '已拦截 Python 系统、网络或进程相关模块',
    },
    {
      pattern: /(?:^|[^\w])(?:open|eval|exec|compile|__import__|input|globals|locals|vars)\s*\(/i,
      message: '已拦截 Python 文件、动态执行或交互输入能力',
    },
    {
      pattern: /(?:^|[^\w])(?:getattr|setattr|delattr|hasattr|dir|type|object|super)\s*\(|__(?:builtins|globals|dict|class|base|bases|subclasses|mro)__|\b(?:builtins|importlib)\b/i,
      message: '已拦截 Python 反射、内建对象或动态导入能力',
    },
    {
      pattern: /\b(?:os|sys|subprocess|socket|pathlib|shutil|ctypes|requests|urllib|http|ftplib|asyncio|builtins|importlib|multiprocessing|threading|pickle|marshal)\s*\./i,
      message: '已拦截 Python 系统对象访问',
    },
  ],
  java: [
    {
      pattern: /\b(?:java\.io|java\.nio|java\.net|Runtime|getRuntime|ProcessBuilder|System\.exit|Files\.|File\s*\(|Socket\s*\(|URL\s*\()/,
      message: '已拦截 Java 文件、网络或进程相关 API',
    },
    {
      pattern: /\bScanner\s*\(\s*System\.in\s*\)/,
      message: '已拦截 Java 交互输入',
    },
    {
      pattern: /\b(?:System\.(?:getenv|getProperty|getProperties|setProperty|load|loadLibrary)|Class\.forName|java\.lang\.reflect|reflect\.|Method\.invoke|Constructor\.newInstance)\b/,
      message: '已拦截 Java 环境、反射或本地库 API',
    },
  ],
  c: [
    {
      pattern: /#include\s*<\s*(?!stdio\.h\s*>)[^>]+>/,
      message: '已拦截 C 非 stdio 头文件',
    },
    {
      pattern: /\b(?:system|fopen|freopen|remove|rename|popen|fork|socket|getenv|putenv|open|creat|read|write|unlink|chmod|chown|mkdir|rmdir|scanf|gets|dlopen|dlsym|LoadLibrary|WinExec|CreateProcess|ShellExecute)\s*\(/i,
      message: '已拦截 C 文件、网络、环境或进程相关函数',
    },
    {
      pattern: /\bexec[a-z0-9_]*\s*\(/i,
      message: '已拦截 C 进程替换函数',
    },
  ],
  plantuml: [],
}

export function runWebCommandSandbox({ language, source }: WebCommandRunRequest): WebCommandRunResult {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const normalizedSource = source.trim()

  if (!normalizedSource) {
    return createRunResult({
      language,
      started,
      startedAt,
      stdout: '',
      stderr: '没有可执行内容。',
      blocked: [],
      violations: [],
      ok: false,
    })
  }

  if (normalizedSource.length > sourceMaxLength) {
    return createRunResult({
      language,
      started,
      startedAt,
      stdout: '',
      stderr: `源码长度超过 ${sourceMaxLength.toString()} 字符限制。`,
      blocked: ['source-length-limit'],
      violations: [
        {
          message: 'source-length-limit',
          snippet: `${normalizedSource.length.toString()} 字符`,
        },
      ],
      ok: false,
    })
  }

  const violations = findSecurityViolations(language, normalizedSource)
  if (violations.length > 0) {
    const blocked = violations.map((violation) => violation.message)
    return createRunResult({
      language,
      started,
      startedAt,
      stdout: '',
      stderr: formatSecurityViolationMessage(violations),
      blocked,
      violations,
      ok: false,
    })
  }

  const stdout = collectSandboxStdout(language, normalizedSource)
  const ok = stdout.length > 0

  return createRunResult({
    language,
    started,
    startedAt,
    stdout,
    stderr: ok ? '' : '没有检测到当前沙箱支持的输出语句。',
    blocked: [],
    violations: [],
    ok,
  })
}

function createRunResult({
  language,
  started,
  startedAt,
  stdout,
  stderr,
  blocked,
  violations,
  ok,
}: {
  language: WebCommandLanguage
  started: number
  startedAt: string
  stdout: string
  stderr: string
  blocked: string[]
  violations: WebCommandSecurityViolation[]
  ok: boolean
}): WebCommandRunResult {
  const finished = Date.now()
  const parsedJson = parseStdoutJson(stdout)

  return {
    ok,
    language,
    sandbox: 'browser-output-sandbox',
    exitCode: ok ? 0 : 1,
    durationMs: finished - started,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    stdout,
    stderr,
    blocked,
    violations,
    result: {
      lines: stdout.trimEnd() ? stdout.trimEnd().split('\n') : [],
      text: stdout,
      parsedJson,
    },
  }
}

function findSecurityViolations(language: WebCommandLanguage, source: string): WebCommandSecurityViolation[] {
  return securityRules[language]
    .map((rule) => {
      rule.pattern.lastIndex = 0
      const match = rule.pattern.exec(source)
      rule.pattern.lastIndex = 0

      return match
        ? {
            message: rule.message,
            snippet: normalizeViolationSnippet(match[0]),
          }
        : null
    })
    .filter((violation): violation is WebCommandSecurityViolation => Boolean(violation))
}

function formatSecurityViolationMessage(violations: WebCommandSecurityViolation[]) {
  const details = violations.map((violation) =>
    `${violation.message}（触发片段：${violation.snippet}）`,
  )

  return `沙箱拦截：${details.join('；')}`
}

function normalizeViolationSnippet(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '未知片段'
  }

  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}

function collectSandboxStdout(language: WebCommandLanguage, source: string) {
  switch (language) {
    case 'python':
      return collectPythonStdout(source)
    case 'java':
      return collectFunctionCallStdout(source, /System\.out\.(println|print)\s*\(/g, 'java')
    case 'c':
      return collectFunctionCallStdout(source, /\b(printf|puts)\s*\(/g, 'c')
    case 'plantuml':
      return ''
  }
}

function collectPythonStdout(source: string) {
  let stdout = ''
  const pattern = /\bprint\s*\(/g

  while (pattern.exec(source)) {
    const openIndex = pattern.lastIndex - 1
    const closeIndex = findMatchingParen(source, openIndex)
    if (closeIndex === -1) {
      continue
    }

    const rawArguments = source.slice(openIndex + 1, closeIndex)
    const output = evaluatePythonPrint(rawArguments)
    stdout += output.text
    if (output.newline) {
      stdout += '\n'
    }
    pattern.lastIndex = closeIndex + 1
  }

  return stdout
}

function collectFunctionCallStdout(source: string, pattern: RegExp, language: 'java' | 'c') {
  let stdout = ''
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source))) {
    const callName = match[1]
    const openIndex = pattern.lastIndex - 1
    const closeIndex = findMatchingParen(source, openIndex)
    if (closeIndex === -1) {
      continue
    }

    const rawArguments = source.slice(openIndex + 1, closeIndex)
    if (language === 'java') {
      const value = formatExpressionValue(evaluateExpression(rawArguments))
      stdout += value
      if (callName === 'println') {
        stdout += '\n'
      }
    } else if (callName === 'puts') {
      stdout += `${formatExpressionValue(evaluateExpression(rawArguments))}\n`
    } else {
      stdout += evaluateCPrintf(rawArguments)
    }

    pattern.lastIndex = closeIndex + 1
  }

  return stdout
}

function evaluatePythonPrint(rawArguments: string) {
  const args = splitTopLevel(rawArguments, ',')
  let separator = ' '
  let end = '\n'
  const values: unknown[] = []

  for (const arg of args) {
    const trimmedArg = arg.trim()
    if (!trimmedArg) {
      continue
    }

    if (trimmedArg.startsWith('sep=')) {
      separator = formatExpressionValue(evaluateExpression(trimmedArg.slice(4)))
      continue
    }

    if (trimmedArg.startsWith('end=')) {
      end = formatExpressionValue(evaluateExpression(trimmedArg.slice(4)))
      continue
    }

    values.push(evaluateExpression(trimmedArg))
  }

  const text = values.map(formatExpressionValue).join(separator) + end.replace(/\n$/, '')
  return {
    text,
    newline: end.endsWith('\n'),
  }
}

function evaluateCPrintf(rawArguments: string) {
  const args = splitTopLevel(rawArguments, ',')
  const format = parseStringLiteral(args[0]?.trim() ?? '')
  if (format === null) {
    return ''
  }

  const values = args.slice(1).map((arg) => evaluateExpression(arg))
  let valueIndex = 0

  return format.replace(/%([0-9.]*)([sdif])/g, (token: string, specifier: string, kind: string) => {
    const value = values[valueIndex]
    valueIndex += 1

    if (kind === 's') {
      return formatExpressionValue(value)
    }

    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) {
      return token
    }

    if (kind === 'f') {
      const precisionMatch = specifier.match(/\.(\d+)/)
      return precisionMatch ? numericValue.toFixed(Number(precisionMatch[1])) : numericValue.toString()
    }

    return Math.trunc(numericValue).toString()
  }).replace(/%%/g, '%')
}

function evaluateExpression(rawExpression: string): unknown {
  const expression = unwrapParentheses(rawExpression.trim())
  if (!expression) {
    return ''
  }

  const stringValue = parseStringLiteral(expression)
  if (stringValue !== null) {
    return stringValue
  }

  if (/^(?:true|false)$/i.test(expression)) {
    return expression.toLowerCase() === 'true'
  }

  if (/^(?:none|null)$/i.test(expression)) {
    return null
  }

  if (/^[0-9+\-*/%().\s]+$/.test(expression) && /\d/.test(expression)) {
    const arithmeticValue = evaluateArithmetic(expression)
    if (arithmeticValue !== null) {
      return arithmeticValue
    }
  }

  const plusParts = splitTopLevel(expression, '+')
  if (plusParts.length > 1) {
    return plusParts.map((part) => formatExpressionValue(evaluateExpression(part))).join('')
  }

  return expression
}

function evaluateArithmetic(expression: string) {
  try {
    const value = Function(`"use strict"; return (${expression});`)() as unknown
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function parseStringLiteral(expression: string) {
  const trimmedExpression = expression.trim()
  if (trimmedExpression.length < 2) {
    return null
  }

  const quote = trimmedExpression[0]
  if ((quote !== '"' && quote !== "'") || trimmedExpression.at(-1) !== quote) {
    return null
  }

  let value = ''
  for (let index = 1; index < trimmedExpression.length - 1; index += 1) {
    const char = trimmedExpression[index]
    if (char !== '\\') {
      value += char
      continue
    }

    index += 1
    const escaped = trimmedExpression[index]
    switch (escaped) {
      case 'n':
        value += '\n'
        break
      case 'r':
        value += '\r'
        break
      case 't':
        value += '\t'
        break
      case '\\':
        value += '\\'
        break
      case '"':
        value += '"'
        break
      case "'":
        value += "'"
        break
      default:
        value += escaped ?? ''
        break
    }
  }

  return value
}

function formatExpressionValue(value: unknown) {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString()
  }

  return JSON.stringify(value)
}

function splitTopLevel(value: string, separator: ',' | '+') {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  let depth = 0

  for (const char of value) {
    if (quote) {
      current += char
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      current += char
      continue
    }

    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }

    current += char
  }

  parts.push(current)
  return parts
}

function unwrapParentheses(expression: string) {
  let nextExpression = expression

  while (nextExpression.startsWith('(') && nextExpression.endsWith(')')) {
    const closeIndex = findMatchingParen(nextExpression, 0)
    if (closeIndex !== nextExpression.length - 1) {
      break
    }

    nextExpression = nextExpression.slice(1, -1).trim()
  }

  return nextExpression
}

function findMatchingParen(value: string, openIndex: number) {
  let quote: '"' | "'" | null = null
  let escaped = false
  let depth = 0

  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function parseStdoutJson(stdout: string): unknown | null {
  const trimmedStdout = stdout.trim()
  if (!trimmedStdout) {
    return null
  }

  try {
    return JSON.parse(trimmedStdout) as unknown
  } catch {
    const lastJsonLine = trimmedStdout
      .split('\n')
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.startsWith('{') || line.startsWith('['))

    if (!lastJsonLine) {
      return null
    }

    try {
      return JSON.parse(lastJsonLine) as unknown
    } catch {
      return null
    }
  }
}
