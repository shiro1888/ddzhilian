import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Play, RotateCcw, Trash2 } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import {
  runWebCommandSandbox,
  webCommandDefaultSources,
} from '../web-command-sandbox'
import type {
  WebCommandLanguage,
  WebCommandRunResult,
} from '../web-command-sandbox'

const languageLabels: Record<WebCommandLanguage, string> = {
  python: 'Python',
  java: 'Java',
  c: 'C',
}

const supportedLanguages: WebCommandLanguage[] = ['python', 'java', 'c']

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function WebCommandStage() {
  const [language, setLanguage] = useState<WebCommandLanguage>('python')
  const [source, setSource] = useState(webCommandDefaultSources.python)
  const [result, setResult] = useState<WebCommandRunResult | null>(null)
  const [copyLabel, setCopyLabel] = useState('复制结果')
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const languageRef = useRef(language)
  const sourceRef = useRef(source)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    sourceRef.current = source
  }, [source])

  const resultOutput = useMemo(() => {
    if (!result) {
      return '暂无输出。运行代码后这里显示输出结果。'
    }

    const outputBlocks = [
      result.stdout.trimEnd(),
      result.stderr ? `错误：${result.stderr}` : '',
    ].filter(Boolean)

    return outputBlocks.length > 0 ? outputBlocks.join('\n') : '无输出。'
  }, [result])

  const writeOutputToTerminal = useCallback((value: string) => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.write(value.replace(/\n/g, '\r\n'))
  }, [])

  const writeRunResult = useCallback((nextResult: WebCommandRunResult) => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()
    terminal.clear()
    if (nextResult.stdout) {
      writeOutputToTerminal(nextResult.stdout)
    }
    if (nextResult.stderr) {
      writeOutputToTerminal(nextResult.stderr)
    }
    if (!nextResult.stdout && !nextResult.stderr) {
      writeOutputToTerminal('无输出。')
    }
  }, [writeOutputToTerminal])

  const executeCurrentSource = useCallback(() => {
    const nextResult = runWebCommandSandbox({
      language: languageRef.current,
      source: sourceRef.current,
    })
    setResult(nextResult)
    writeRunResult(nextResult)
  }, [writeRunResult])

  const switchLanguage = useCallback((nextLanguage: WebCommandLanguage) => {
    setLanguage(nextLanguage)
    setSource(webCommandDefaultSources[nextLanguage])
    setResult(null)
  }, [])

  useEffect(() => {
    const terminalHost = terminalHostRef.current
    if (!terminalHost) {
      return undefined
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      scrollback: 600,
      theme: {
        background: '#111111',
        foreground: '#f5f5f5',
        cursor: '#95ec69',
        selectionBackground: '#3f3f46',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalHost)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalHost)
    window.requestAnimationFrame(() => fitAddon.fit())

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  const handleLanguageChange = (nextLanguage: WebCommandLanguage) => {
    switchLanguage(nextLanguage)
  }

  const handleClearTerminal = () => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()
    terminal.clear()
  }

  const handleResetSource = () => {
    setSource(webCommandDefaultSources[language])
    setResult(null)
  }

  const handleCopyResult = () => {
    void copyText(resultOutput)
      .then(() => {
        setCopyLabel('已复制')
        window.setTimeout(() => setCopyLabel('复制结果'), 1200)
      })
      .catch(() => {
        setCopyLabel('复制失败')
        window.setTimeout(() => setCopyLabel('复制结果'), 1200)
      })
  }

  return (
    <section className="dd-web-command" aria-label="Web 命令行">
      <header className="dd-web-command__head">
        <div>
          <span className="dd-web-command__eyebrow">浏览器沙箱</span>
          <h1>Web 命令行</h1>
        </div>
        <div className="dd-web-command__head-actions">
          <label>
            <span>语言</span>
            <select
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as WebCommandLanguage)}
            >
              {supportedLanguages.map((item) => (
                <option key={item} value={item}>
                  {languageLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dd-web-command__primary" onClick={executeCurrentSource}>
            <Play size={15} aria-hidden="true" />
            运行
          </button>
          <button type="button" onClick={handleResetSource}>
            <RotateCcw size={15} aria-hidden="true" />
            重置
          </button>
        </div>
      </header>

      <div className="dd-web-command__workspace">
        <section className="dd-web-command__source" aria-label="源码">
          <div className="dd-web-command__panel-head">
            <strong>{languageLabels[language]}</strong>
            <span>{source.length.toString()} 字符</span>
          </div>
          <textarea
            value={source}
            spellCheck={false}
            onChange={(event) => setSource(event.target.value)}
          />
        </section>

        <section className="dd-web-command__output" aria-label="运行输出">
          <div className="dd-web-command__terminal-head">
            <strong>Terminal</strong>
            <div>
              <button type="button" onClick={handleClearTerminal}>
                <Trash2 size={14} aria-hidden="true" />
                清空
              </button>
              <button type="button" onClick={handleCopyResult}>
                <Copy size={14} aria-hidden="true" />
                {copyLabel}
              </button>
            </div>
          </div>
          <div ref={terminalHostRef} className="dd-web-command__terminal" />
          <div className="dd-web-command__result-head">
            <strong>输出结果</strong>
            <span className={result?.ok ? 'is-ok' : result ? 'is-error' : ''}>
              {result ? `exit ${result.exitCode.toString()}` : 'idle'}
            </span>
          </div>
          <pre className="dd-web-command__result">{resultOutput}</pre>
        </section>
      </div>
    </section>
  )
}
