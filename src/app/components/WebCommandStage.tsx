import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Code2,
  Copy,
  FileCode2,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { navigateBackToText } from '../../lib/navigate-back-to-text'
import {
  runWebCommandSandbox,
  serverSandboxLanguages,
  webCommandDefaultSources,
  webCommandPresets,
} from '../web-command-sandbox'
import { copyImageDataUrlToClipboard } from '../web-command-clipboard'
import type {
  WebCommandLanguage,
  WebCommandRunResult,
} from '../web-command-sandbox'
import {
  copyText,
  createWebCommandErrorResult,
  getCopyDefaultLabel,
  getEditorFilename,
  languageLabels,
  plantUmlAutoRenderDelayMs,
  runJavaDockerSandbox,
  runPlantUmlDockerSandbox,
  supportedLanguages,
} from '../../lib/web-command-utils'

type WebCommandMobilePane = 'source' | 'terminal' | 'result'

type WebCommandStageProps = {
  historyAuthToken?: string
  onResultTextChange?: (text: string) => void
  onShareResult?: (text: string) => void
}

export function WebCommandStage({
  historyAuthToken,
  onResultTextChange,
  onShareResult,
}: WebCommandStageProps) {
  const [language, setLanguage] = useState<WebCommandLanguage>('python')
  const [source, setSource] = useState(webCommandDefaultSources.python)
  const [stdin, setStdin] = useState('')
  const [result, setResult] = useState<WebCommandRunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement | null>(null)
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false)
  const presetMenuRef = useRef<HTMLDivElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const presets = useMemo(() => webCommandPresets[language] ?? [], [language])

  const handleEditorScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop
    }
  }
  const [copyLabel, setCopyLabel] = useState(getCopyDefaultLabel('python'))
  const [mobilePane, setMobilePane] = useState<WebCommandMobilePane>('source')
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const languageRef = useRef(language)
  const sourceRef = useRef(source)
  const stdinRef = useRef(stdin)
  const runSequenceRef = useRef(0)
  const autoRenderTimerRef = useRef<number | null>(null)
  const lastRenderedPlantUmlSourceRef = useRef('')
  const isPlantUmlMode = language === 'plantuml'
  const isServerSandboxLanguage = serverSandboxLanguages.has(language)
  const missingSandboxAuth = isServerSandboxLanguage && !historyAuthToken?.trim()

  useEffect(() => {
    if (!isLangMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLangMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLangMenuOpen])

  useEffect(() => {
    if (!isPresetMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(event.target as Node)) {
        setIsPresetMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPresetMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPresetMenuOpen])

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    sourceRef.current = source
  }, [source])

  useEffect(() => {
    stdinRef.current = stdin
  }, [stdin])

  const resultOutput = useMemo(() => {
    if (!result) {
      return isRunning ? '运行中。' : '暂无输出。运行代码后这里显示输出结果。'
    }

    if (result.image && !result.stderr) {
      return `图片已生成（PNG，${result.image.sizeBytes.toString()} bytes）。`
    }

    const outputBlocks = [
      result.stdout.trimEnd(),
      result.stderr ? `错误：${result.stderr}` : '',
    ].filter(Boolean)

    return outputBlocks.length > 0 ? outputBlocks.join('\n') : '无输出。'
  }, [isRunning, result])
  const shareableResultText = result && !isRunning ? resultOutput.trim() : ''

  useEffect(() => {
    onResultTextChange?.(shareableResultText)
  }, [onResultTextChange, shareableResultText])

  const resultStatus = useMemo(() => {
    if (!result) {
      return isRunning ? 'running' : 'idle'
    }

    if (result.timedOut) {
      return 'timeout'
    }

    return `exit ${result.exitCode.toString()}`
  }, [isRunning, result])

  const writeOutputToTerminal = useCallback((value: string) => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.write(value.replace(/\n/g, '\r\n'))
  }, [])

  const writeRunResult = useCallback((nextResult: WebCommandRunResult) => {
    if (nextResult.language === 'plantuml') {
      return
    }

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
      writeOutputToTerminal(`\x1b[38;2;239;68;68m${nextResult.stderr}\x1b[0m`)
    }
    if (!nextResult.stdout && !nextResult.stderr && !nextResult.image) {
      writeOutputToTerminal('\x1b[90m(无标准输出)\x1b[0m\r\n')
    }

    const duration = nextResult.durationMs ? `${nextResult.durationMs}ms` : '<1ms'
    const statusText = nextResult.ok
      ? `\x1b[38;2;16;185;129m✔ 执行完成 (耗时 ${duration}, exit ${nextResult.exitCode})\x1b[0m`
      : `\x1b[38;2;239;68;68m✖ 执行失败 (耗时 ${duration}, exit ${nextResult.exitCode})\x1b[0m`
    writeOutputToTerminal(`\r\n\x1b[90m────────────────────────────────────────\x1b[0m\r\n${statusText}\r\n`)
  }, [writeOutputToTerminal])

  const executeCurrentSource = useCallback(() => {
    const currentLanguage = languageRef.current
    const currentSource = sourceRef.current
    const currentStdin = stdinRef.current
    const currentHistoryAuthToken = historyAuthToken
    const runId = runSequenceRef.current + 1
    const started = Date.now()

    if (serverSandboxLanguages.has(currentLanguage) && !currentHistoryAuthToken?.trim()) {
      const nextResult = createWebCommandErrorResult({
        language: currentLanguage,
        started,
        error: new Error('设备尚未在线，无法使用服务端沙箱。请先回到互传页面完成设备连接，再运行 Java / PlantUML。'),
      })
      setResult(nextResult)
      writeRunResult(nextResult)
      setMobilePane('terminal')
      return
    }

    runSequenceRef.current = runId
    if (currentLanguage === 'plantuml') {
      lastRenderedPlantUmlSourceRef.current = currentSource
    }
    setMobilePane('terminal')
    setIsRunning(true)

    void (async () => {
      try {
        const nextResult = await runCurrentSource({
          language: currentLanguage,
          source: currentSource,
          stdin: currentStdin,
          historyAuthToken: currentHistoryAuthToken,
        })

        if (runSequenceRef.current !== runId) {
          return
        }

        setResult(nextResult)
        writeRunResult(nextResult)
      } catch (error) {
        if (runSequenceRef.current !== runId) {
          return
        }

        const nextResult = createWebCommandErrorResult({
          language: currentLanguage,
          started,
          error,
        })
        setResult(nextResult)
        writeRunResult(nextResult)
      } finally {
        if (runSequenceRef.current === runId) {
          setIsRunning(false)
        }
      }
    })()
  }, [historyAuthToken, writeRunResult])

  const switchLanguage = useCallback((nextLanguage: WebCommandLanguage) => {
    runSequenceRef.current += 1
    if (autoRenderTimerRef.current !== null) {
      window.clearTimeout(autoRenderTimerRef.current)
      autoRenderTimerRef.current = null
    }
    lastRenderedPlantUmlSourceRef.current = ''
    setLanguage(nextLanguage)
    setSource(webCommandDefaultSources[nextLanguage])
    setStdin('')
    setResult(null)
    setIsRunning(false)
    setCopyLabel(getCopyDefaultLabel(nextLanguage))
    setMobilePane('source')
  }, [])

  const resetCopyLabelSoon = useCallback((targetLanguage: WebCommandLanguage) => {
    window.setTimeout(() => setCopyLabel(getCopyDefaultLabel(targetLanguage)), 1200)
  }, [])

  useEffect(() => {
    if (autoRenderTimerRef.current !== null) {
      window.clearTimeout(autoRenderTimerRef.current)
      autoRenderTimerRef.current = null
    }

    if (language !== 'plantuml' || isRunning || !source.trim()) {
      return undefined
    }

    if (source === lastRenderedPlantUmlSourceRef.current) {
      return undefined
    }

    autoRenderTimerRef.current = window.setTimeout(() => {
      autoRenderTimerRef.current = null
      executeCurrentSource()
    }, plantUmlAutoRenderDelayMs)

    return () => {
      if (autoRenderTimerRef.current !== null) {
        window.clearTimeout(autoRenderTimerRef.current)
        autoRenderTimerRef.current = null
      }
    }
  }, [executeCurrentSource, isRunning, language, source])

  useEffect(() => {
    if (language === 'plantuml') {
      return undefined
    }

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
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#10b981',
        selectionBackground: 'rgba(16, 185, 129, 0.25)',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalHost)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Welcome banner in terminal
    terminal.write('\x1b[1;32m✔ DD直连 命令行沙箱终端就绪\x1b[0m\r\n')
    terminal.write('\x1b[90m当前环境: WebAssembly / 服务端容器沙箱\x1b[0m\r\n')
    terminal.write('\x1b[90m快捷键: 点击「运行」或按 Ctrl + Enter 执行代码\x1b[0m\r\n\r\n')

    const fitTerminal = () => {
      fitAddon.fit()
    }
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitTerminal) : null
    resizeObserver?.observe(terminalHost)
    window.addEventListener('resize', fitTerminal)
    window.requestAnimationFrame(fitTerminal)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', fitTerminal)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [language])

  useEffect(() => {
    if (mobilePane !== 'terminal') {
      return
    }

    window.requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit()
      } catch {
        // The terminal may still be hidden during a responsive pane switch.
      }
    })
  }, [mobilePane])

  const handleLanguageChange = (nextLanguage: WebCommandLanguage) => {
    switchLanguage(nextLanguage)
  }

  const handleClearOutput = () => {
    if (languageRef.current === 'plantuml') {
      setResult(null)
      return
    }

    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()
    terminal.clear()
    terminal.write('\x1b[90m(终端已清空，待执行新指令...)\x1b[0m\r\n')
  }

  const handleResetSource = () => {
    setSource(webCommandDefaultSources[language])
    setStdin('')
    setResult(null)
  }

  const handleCopyResult = () => {
    const currentResult = result

    if (currentResult?.language === 'plantuml') {
      if (!currentResult.image) {
        setCopyLabel('无图片')
        resetCopyLabelSoon('plantuml')
        return
      }

      void copyImageDataUrlToClipboard(currentResult.image)
        .then(() => {
          setCopyLabel('已复制图片')
          resetCopyLabelSoon('plantuml')
        })
        .catch(() => {
          setCopyLabel('复制失败')
          resetCopyLabelSoon('plantuml')
        })
      return
    }

    void copyText(resultOutput)
      .then(() => {
        setCopyLabel('已复制')
        resetCopyLabelSoon(languageRef.current)
      })
      .catch(() => {
        setCopyLabel('复制失败')
        resetCopyLabelSoon(languageRef.current)
      })
  }

  const handleShareResult = () => {
    if (!shareableResultText) {
      setCopyLabel('先运行')
      resetCopyLabelSoon(languageRef.current)
      return
    }

    onShareResult?.(shareableResultText)
  }

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!isRunning && !missingSandboxAuth) {
        executeCurrentSource()
      }
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const textarea = event.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const nextSource = source.substring(0, start) + '  ' + source.substring(end)
      setSource(nextSource)
      window.requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      })
    }
  }

  const handleStdinKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!isRunning && !missingSandboxAuth) {
        executeCurrentSource()
      }
    }
  }

  const runState = isRunning ? 'running' : result ? (result.ok ? 'success' : 'failed') : 'idle'
  const runStateLabel = isRunning ? '运行中' : result ? (result.ok ? '运行成功' : '运行失败') : '待运行'
  const sourceLineCount = source.split(/\r?\n/).length
  const mobileTerminalLabel = isPlantUmlMode ? '预览' : '终端'

  return (
    <section className={`dd-web-command is-${runState} is-mobile-${mobilePane}${isPlantUmlMode ? ' is-plantuml' : ''}`} aria-label="命令行">
      <header className="dd-web-command__head">
        <div className="dd-web-command__head-brand">
          <button
            type="button"
            className="dd-web-command__back-btn"
            aria-label="返回"
            onClick={navigateBackToText}
          >
            <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <div className="dd-web-command__head-text">
            <div className="dd-web-command__title-row">
              <h1>命令行</h1>
              <span className="dd-web-command__badge">代码沙箱</span>
            </div>
          </div>
        </div>
        <div className="dd-web-command__head-actions">
          <span className={`dd-web-command__run-state is-${runState}`}>{runStateLabel}</span>
          <div className="dd-web-command__lang-selector" ref={langMenuRef}>
            <button
              type="button"
              className={`dd-web-command__lang-trigger${isLangMenuOpen ? ' is-active' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={isLangMenuOpen}
              aria-label={`切换运行语言，当前${languageLabels[language]}`}
              title="切换运行语言"
              onClick={() => setIsLangMenuOpen((current) => !current)}
            >
              <Code2 size={14} strokeWidth={2} className="dd-web-command__lang-icon" aria-hidden="true" />
              <span className="dd-web-command__lang-current">{languageLabels[language]}</span>
              <ChevronDown size={13} strokeWidth={2.2} className="dd-web-command__lang-chevron" aria-hidden="true" />
            </button>

            {isLangMenuOpen ? (
              <div className="dd-web-command__lang-menu" role="listbox" aria-label="语言选项">
                <div className="dd-web-command__lang-menu-list">
                  {supportedLanguages.map((item) => {
                    const isSelected = item === language
                    return (
                      <button
                        key={item}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`dd-web-command__lang-option${isSelected ? ' is-selected' : ''}`}
                        onClick={() => {
                          handleLanguageChange(item)
                          setIsLangMenuOpen(false)
                        }}
                      >
                        <span className={`dd-web-command__lang-badge is-${item}`}>
                          {item === 'c' ? 'C' : item === 'plantuml' ? 'UML' : item.toUpperCase().slice(0, 2)}
                        </span>
                        <div className="dd-web-command__lang-option-text">
                          <strong>{languageLabels[item]}</strong>
                        </div>
                        {isSelected ? (
                          <Check size={16} strokeWidth={2.5} className="dd-web-command__lang-check" aria-hidden="true" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="dd-web-command__primary"
            disabled={isRunning || missingSandboxAuth}
            title={missingSandboxAuth ? '设备未在线：Java / PlantUML 需要先连接后端沙箱，请先进入在线状态' : undefined}
            onClick={executeCurrentSource}
          >
            {isRunning ? <Loader2 size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {isRunning ? '运行中' : missingSandboxAuth ? '需先在线' : '运行'}
          </button>
          <button type="button" disabled={isRunning} onClick={handleResetSource}>
            <RotateCcw size={15} aria-hidden="true" />
            重置
          </button>
        </div>
      </header>

      <nav className="dd-web-command__mobile-tabs" aria-label="命令行移动端面板">
        <button
          type="button"
          className={mobilePane === 'source' ? 'is-active' : ''}
          aria-pressed={mobilePane === 'source'}
          onClick={() => setMobilePane('source')}
        >
          代码
        </button>
        <button
          type="button"
          className={mobilePane === 'terminal' ? 'is-active' : ''}
          aria-pressed={mobilePane === 'terminal'}
          onClick={() => setMobilePane('terminal')}
        >
          {mobileTerminalLabel}
        </button>
        <button
          type="button"
          className={mobilePane === 'result' ? 'is-active' : ''}
          aria-pressed={mobilePane === 'result'}
          onClick={() => setMobilePane('result')}
        >
          输出
        </button>
      </nav>

      <div className="dd-web-command__workspace">
        <section
          className={`dd-web-command__source${language === 'java' ? ' has-stdin' : ''}`}
          aria-label="源码"
        >
          <div className="dd-web-command__panel-head">
            <div className="dd-web-command__panel-head-left">
              <span className="dd-web-command__file-tab">
                <FileCode2 size={14} className="dd-web-command__file-tab-icon" aria-hidden="true" />
                <strong>{getEditorFilename(language)}</strong>
              </span>
              <span className="dd-web-command__panel-pill">{sourceLineCount.toString()} 行 · {source.length.toString()} 字符</span>
              <span className="dd-web-command__kbd-hint">Ctrl+Enter 运行</span>
            </div>
            <div className="dd-web-command__panel-head-actions">
              {presets.length > 0 ? (
                <div className="dd-web-command__preset-selector" ref={presetMenuRef}>
                  <button
                    type="button"
                    className="dd-web-command__mini-btn is-preset"
                    aria-label="选择代码示例模版"
                    title="选择代码示例模版"
                    onClick={() => setIsPresetMenuOpen((v) => !v)}
                  >
                    <Sparkles size={12} aria-hidden="true" />
                    <span>示例模版</span>
                    <ChevronDown size={11} aria-hidden="true" />
                  </button>
                  {isPresetMenuOpen ? (
                    <div className="dd-web-command__preset-menu" role="menu">
                      <div className="dd-web-command__preset-menu-title">选择代码示例</div>
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="dd-web-command__preset-item"
                          onClick={() => {
                            setSource(preset.source)
                            if (preset.stdin !== undefined) {
                              setStdin(preset.stdin)
                            }
                            setIsPresetMenuOpen(false)
                          }}
                        >
                          <div className="dd-web-command__preset-item-label">{preset.label}</div>
                          <div className="dd-web-command__preset-item-desc">{preset.description}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="dd-web-command__mini-btn"
                title="清空代码"
                onClick={() => setSource('')}
              >
                <Trash2 size={12} aria-hidden="true" />
                <span>清空</span>
              </button>
              <button
                type="button"
                className="dd-web-command__mini-btn"
                title="复制代码"
                onClick={() => copyText(source)}
              >
                <Copy size={12} aria-hidden="true" />
                <span>复制</span>
              </button>
            </div>
          </div>
          <div className="dd-web-command__editor-container">
            <div className="dd-web-command__gutter" ref={gutterRef} aria-hidden="true">
              {Array.from({ length: sourceLineCount }, (_, i) => (
                <span key={i + 1} className="dd-web-command__gutter-num">{i + 1}</span>
              ))}
            </div>
            <textarea
              className="dd-web-command__editor-input"
              value={source}
              spellCheck={false}
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              onScroll={handleEditorScroll}
            />
          </div>
          {language === 'java' ? (
            <>
              <div className="dd-web-command__panel-head is-stdin">
                <div className="dd-web-command__panel-head-left">
                  <strong>stdin 标准输入</strong>
                  <span className="dd-web-command__panel-pill">{stdin.length.toString()} 字符</span>
                </div>
                <div className="dd-web-command__panel-head-actions">
                  <button
                    type="button"
                    className="dd-web-command__mini-btn"
                    title="清空标准输入"
                    onClick={() => setStdin('')}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    <span>清空</span>
                  </button>
                </div>
              </div>
              <textarea
                className="dd-web-command__stdin-input"
                value={stdin}
                spellCheck={false}
                aria-label="Java 标准输入"
                onChange={(event) => setStdin(event.target.value)}
                onKeyDown={handleStdinKeyDown}
              />
            </>
          ) : null}
        </section>

        <section className={`dd-web-command__output${isPlantUmlMode ? ' is-plantuml' : ''}`} aria-label="运行输出">
          {isPlantUmlMode ? (
            <>
              <div className="dd-web-command__viewer-head">
                <div className="dd-web-command__viewer-title">
                  <span className="dd-web-command__file-tab is-preview">
                    <FileCode2 size={14} className="dd-web-command__file-tab-icon" aria-hidden="true" />
                    <strong>预览</strong>
                  </span>
                  <span className={result?.ok ? 'is-ok' : result ? 'is-error' : ''}>
                    {resultStatus}
                  </span>
                </div>
                <div className="dd-web-command__terminal-actions">
                  <button type="button" disabled={isRunning} onClick={handleClearOutput}>
                    <Trash2 size={13} aria-hidden="true" />
                    <span>清空</span>
                  </button>
                  <button type="button" onClick={handleCopyResult}>
                    <Copy size={13} aria-hidden="true" />
                    <span>{copyLabel}</span>
                  </button>
                  <button type="button" className="is-send" disabled={!shareableResultText} onClick={handleShareResult}>
                    <Send size={13} aria-hidden="true" />
                    <span>发送结果</span>
                  </button>
                </div>
              </div>
              <div className="dd-web-command__viewer-body">
                {result?.image?.dataUrl ? (
                  <div className="dd-web-command__image-result">
                    <img src={result.image.dataUrl} alt="PlantUML 渲染结果" />
                  </div>
                ) : (
                  <div className={`dd-web-command__image-empty${result ? ' is-error' : ''}`}>
                    <strong>{isRunning ? '正在渲染' : result ? '渲染失败' : '暂无图片'}</strong>
                    {result ? <pre className="dd-web-command__result">{resultOutput}</pre> : null}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="dd-web-command__terminal-head">
                <div className="dd-web-command__terminal-title">
                  <div className="dd-web-command__term-dots" aria-hidden="true">
                    <span className="dd-term-dot is-red" />
                    <span className="dd-term-dot is-yellow" />
                    <span className="dd-term-dot is-green" />
                  </div>
                  <span className="dd-web-command__file-tab is-terminal">
                    <TerminalIcon size={14} className="dd-web-command__file-tab-icon" aria-hidden="true" />
                    <strong>终端</strong>
                  </span>
                  <span className={`dd-web-command__terminal-pill ${result?.ok ? 'is-ok' : result ? 'is-error' : ''}`}>
                    {resultStatus}
                  </span>
                </div>
                <div className="dd-web-command__terminal-actions">
                  <button type="button" onClick={handleClearOutput}>
                    <Trash2 size={13} aria-hidden="true" />
                    <span>清空</span>
                  </button>
                  <button type="button" onClick={handleCopyResult}>
                    <Copy size={13} aria-hidden="true" />
                    <span>{copyLabel}</span>
                  </button>
                  <button type="button" className="is-send" disabled={!shareableResultText} onClick={handleShareResult}>
                    <Send size={13} aria-hidden="true" />
                    <span>发送结果</span>
                  </button>
                </div>
              </div>
              <div ref={terminalHostRef} className="dd-web-command__terminal" />
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function runCurrentSource({
  language,
  source,
  stdin,
  historyAuthToken,
}: {
  language: WebCommandLanguage
  source: string
  stdin: string
  historyAuthToken?: string
}) {
  switch (language) {
    case 'java':
      return runJavaDockerSandbox({ source, stdin, historyAuthToken })
    case 'plantuml':
      return runPlantUmlDockerSandbox({ source, historyAuthToken })
    case 'python':
    case 'c':
      return Promise.resolve(runWebCommandSandbox({ language, source }))
  }
}
