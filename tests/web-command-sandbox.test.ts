import { describe, expect, it } from 'vitest'
import { runWebCommandSandbox, webCommandDefaultSources } from '../src/app/web-command-sandbox'

describe('web command sandbox', () => {
  it('collects Python print output and parses JSON stdout', () => {
    const result = runWebCommandSandbox({
      language: 'python',
      source: 'print("{\\"ok\\":true,\\"value\\":42}")',
    })

    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('{"ok":true,"value":42}\n')
    expect(result.result.parsedJson).toEqual({ ok: true, value: 42 })
  })

  it('evaluates arithmetic when the production CSP blocks dynamic code generation', () => {
    const originalFunction = globalThis.Function
    let result: ReturnType<typeof runWebCommandSandbox>

    Object.defineProperty(globalThis, 'Function', {
      configurable: true,
      writable: true,
      value: () => {
        throw new EvalError('Blocked by Content Security Policy')
      },
    })

    try {
      result = runWebCommandSandbox({
        language: 'python',
        source: webCommandDefaultSources.python,
      })
    } finally {
      Object.defineProperty(globalThis, 'Function', {
        configurable: true,
        writable: true,
        value: originalFunction,
      })
    }

    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('hello from python\nanswer = 42\n')
  })

  it('collects Java System.out output', () => {
    const result = runWebCommandSandbox({
      language: 'java',
      source: 'System.out.println("answer = " + (40 + 2));',
    })

    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('answer = 42\n')
  })

  it('parses the last JSON-like stdout line when stdout has logs first', () => {
    const result = runWebCommandSandbox({
      language: 'python',
      source: 'print("ready")\nprint("{\\"ok\\":true}")',
    })

    expect(result.ok).toBe(true)
    expect(result.result.parsedJson).toEqual({ ok: true })
  })

  it('collects C printf output', () => {
    const result = runWebCommandSandbox({
      language: 'c',
      source: 'printf("answer = %d\\n", 40 + 2);',
    })

    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('answer = 42\n')
  })

  it('keeps a PlantUML default source for the backend renderer', () => {
    expect(webCommandDefaultSources.plantuml).toContain('@startuml')
    expect(webCommandDefaultSources.plantuml).toContain('@enduml')
  })

  it('blocks process and file APIs before collecting output', () => {
    const result = runWebCommandSandbox({
      language: 'python',
      source: 'import os\nprint("unsafe")',
    })

    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.blocked).toContain('已拦截 Python 系统、网络或进程相关模块')
    expect(result.violations).toContainEqual({
      message: '已拦截 Python 系统、网络或进程相关模块',
      snippet: 'import os',
    })
    expect(result.stderr).toContain('触发片段：import os')
  })

  it.each([
    {
      name: 'Python dynamic builtins import',
      language: 'python' as const,
      source: 'print(getattr(__builtins__, "__import__")("os").system("whoami"))',
      message: '已拦截 Python 反射、内建对象或动态导入能力',
    },
    {
      name: 'Python importlib dynamic import',
      language: 'python' as const,
      source: 'import importlib\nprint(importlib.import_module("os").system("whoami"))',
      message: '已拦截 Python 系统、网络或进程相关模块',
    },
    {
      name: 'Python file read',
      language: 'python' as const,
      source: 'print(open("/etc/passwd").read())',
      message: '已拦截 Python 文件、动态执行或交互输入能力',
    },
    {
      name: 'Java environment read',
      language: 'java' as const,
      source: 'System.out.println(System.getenv("PATH"));',
      message: '已拦截 Java 环境、反射或本地库 API',
    },
    {
      name: 'Java reflection entry',
      language: 'java' as const,
      source: 'System.out.println(Class.forName("java.lang.Runtime"));',
      message: '已拦截 Java 环境、反射或本地库 API',
    },
    {
      name: 'Java process builder',
      language: 'java' as const,
      source: 'System.out.println(new ProcessBuilder("cmd").start());',
      message: '已拦截 Java 文件、网络或进程相关 API',
    },
    {
      name: 'C stdin read',
      language: 'c' as const,
      source: 'char buffer[8]; scanf("%s", buffer); printf("unsafe");',
      message: '已拦截 C 文件、网络、环境或进程相关函数',
    },
    {
      name: 'C dynamic library load',
      language: 'c' as const,
      source: 'dlopen("payload.so", 1); printf("unsafe");',
      message: '已拦截 C 文件、网络、环境或进程相关函数',
    },
    {
      name: 'C non-stdio include',
      language: 'c' as const,
      source: '#include <stdlib.h>\nprintf("unsafe");',
      message: '已拦截 C 非 stdio 头文件',
    },
  ])('blocks high-risk sandbox attempt: $name', ({ language, source, message }) => {
    const result = runWebCommandSandbox({ language, source })

    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.blocked).toContain(message)
    expect(result.violations.some((violation) => violation.message === message && violation.snippet.length > 0)).toBe(true)
    expect(result.stderr).toContain('触发片段：')
  })
})
