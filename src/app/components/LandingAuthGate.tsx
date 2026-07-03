import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { AccountEmailCheckResponse, AccountUser } from '../../lib/ddzhilian-types'

type LandingAuthMode = 'identity' | 'login' | 'register'

const landingFeatureSections = [
  {
    number: '01',
    eyebrow: '文本与文件',
    title: '跨设备文本与文件互传',
    summary: '把电脑、手机和浏览器设备放进同一个对话里，内容按聊天流发送，不需要来回复制粘贴。',
    points: [
      '电脑整理好的文字可以直接发到手机接收。',
      '图片、PDF、压缩包等文件在同一条会话里记录。',
      '发送进度和完成状态跟随消息一起展示。',
    ],
  },
  {
    number: '02',
    eyebrow: '设备协同',
    title: '多设备同时在线',
    summary: '多个设备进入同一个空间后，可以看到统一的对话上下文，适合临时协作和个人跨设备传输。',
    points: [
      '电脑、手机、浏览器窗口可以作为不同设备加入。',
      '在线人数和测试环境状态在界面中可见。',
      '不同设备发送的内容按时间顺序汇总。',
    ],
  },
  {
    number: '03',
    eyebrow: '历史记录',
    title: '会话历史集中查看',
    summary: '公共对话、临时房间、文件进度和历史记录集中在一个界面，找内容不需要来回切页面。',
    points: [
      '文本消息、文件消息和操作记录保留在同一条时间线。',
      '临时对话和公共对话可以区分管理。',
    '传输记录重新打开后仍然容易定位。',
    ],
  },
  {
    number: '04',
    eyebrow: 'AI 处理',
    title: 'AI 处理入口',
    summary: '传输内容之后可以继续让 AI 处理，把总结、改写和问答收敛在同一套工作台里。',
    points: [
      '在对话里直接 @Ai 总结、改写或处理文本。',
      '聊天和 AI 入口在同一套工作台里切换。',
      '处理结果可以继续留在当前会话上下文中。',
    ],
  },
]

type LandingAuthGateProps = {
  isLandingEntry: boolean
  isLoading: boolean
  isSubmitting: boolean
  isAuthenticated: boolean
  user: AccountUser | null
  error: string | null
  children: ReactNode
  onCheckEmailRegistration: (email: string) => Promise<AccountEmailCheckResponse>
  onLogin: (email: string, password: string) => Promise<unknown>
  onRegister: (email: string, password: string) => Promise<{
    email?: string
    message?: string
    requiresEmailConfirmation?: boolean
  }>
}

const landingNameStorageKey = 'ddzhilian:landing-display-name'
const landingNamesStorageKey = 'ddzhilian:landing-display-names'
const landingIntroDurationMs = 3000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readStoredLandingName() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(landingNameStorageKey)?.trim() ?? ''
}

function readStoredLandingNames(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const storedValue = window.localStorage.getItem(landingNamesStorageKey)
    const parsedValue = storedValue ? JSON.parse(storedValue) : {}
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsedValue)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([email, name]) => [email.trim().toLowerCase(), normalizeLandingName(name)]),
    )
  } catch {
    return {}
  }
}

function readStoredLandingNameForEmail(email: string) {
  return resolveStoredLandingName(readStoredLandingNames()[email.trim().toLowerCase()] ?? '', email)
}

function writeStoredLandingName(name: string, email?: string) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedName = normalizeLandingName(name)
  if (!normalizedName) {
    return
  }

  window.localStorage.setItem(landingNameStorageKey, normalizedName)

  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) {
    return
  }

  window.localStorage.setItem(
    landingNamesStorageKey,
    JSON.stringify({
      ...readStoredLandingNames(),
      [normalizedEmail]: normalizedName,
    }),
  )
}

function normalizeLandingName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40)
}

function deriveNameFromEmail(email: string | undefined) {
  const normalizedEmail = email?.trim()
  if (!normalizedEmail) {
    return ''
  }

  return normalizedEmail
}

function resolveStoredLandingName(name: string, email: string | undefined) {
  const normalizedName = normalizeLandingName(name)
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedName || !normalizedEmail) {
    return normalizedName
  }

  const emailLocalPart = normalizedEmail.split('@')[0]
  return normalizedName.toLowerCase() === emailLocalPart ? '' : normalizedName
}

function useTypewriterText(text: string, enabled: boolean) {
  const [typingState, setTypingState] = useState({
    displayedText: '',
    sourceText: '',
  })

  useEffect(() => {
    if (!enabled || !text) {
      return undefined
    }

    let index = 0
    let timerId: number | undefined

    const appendNextCharacter = () => {
      index += 1
      setTypingState({
        displayedText: text.slice(0, index),
        sourceText: text,
      })

      if (index < text.length) {
        timerId = window.setTimeout(appendNextCharacter, 130)
      }
    }

    timerId = window.setTimeout(appendNextCharacter, 120)

    return () => {
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
      }
    }
  }, [enabled, text])

  return enabled && typingState.sourceText === text ? typingState.displayedText : ''
}

function LandingFeaturePreview() {
  return (
    <div className="dd-landing-preview">
      <div className="dd-landing-preview__hero">
        <div className="dd-landing-preview__copy">
          <span>ddzhilian 能做什么</span>
          <h2>把传文件、发文本、公共对话和 AI 工具放进同一个轻量工作台。</h2>
        </div>
        <figure className="dd-landing-preview__shot">
          <img
            src="/landing-test-chat.png"
            alt="ddzhilian"
            loading="lazy"
          />
        </figure>
      </div>

      <div className="dd-landing-preview__sections" aria-label="ddzhilian 功能逐项介绍">
        {landingFeatureSections.map((feature) => (
          <article key={feature.title} className="dd-landing-preview__section">
            <span className="dd-landing-preview__number">{feature.number}</span>
            <div className="dd-landing-preview__section-copy">
              <p className="dd-landing-preview__eyebrow">{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <p>{feature.summary}</p>
              <ul>
                {feature.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function LandingAuthGate({
  isLandingEntry,
  isLoading,
  isSubmitting,
  isAuthenticated,
  user,
  error,
  children,
  onCheckEmailRegistration,
  onLogin,
  onRegister,
}: LandingAuthGateProps) {
  const siteRef = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<LandingAuthMode>('identity')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [storedName, setStoredName] = useState(readStoredLandingName)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [isIntroGreetingVisible, setIsIntroGreetingVisible] = useState(true)

  const normalizedEmail = email.trim().toLowerCase()
  const greetingName = useMemo(
    () => {
      if (isAuthenticated) {
        return resolveStoredLandingName(storedName, user?.email) || deriveNameFromEmail(user?.email) || 'ddzhilian'
      }

      if (mode === 'login') {
        return resolveStoredLandingName(storedName, normalizedEmail) || deriveNameFromEmail(normalizedEmail)
      }

      if (mode === 'register') {
        return normalizeLandingName(username)
      }

      return ''
    },
    [isAuthenticated, mode, normalizedEmail, storedName, username, user?.email],
  )
  const typedGreetingName = useTypewriterText(greetingName, isLandingEntry && isAuthenticated && !isLoading)
  const displayedGreetingName = isAuthenticated ? typedGreetingName : greetingName
  const shouldShowIntroGreeting = isLandingEntry && isIntroGreetingVisible
  const isBusy = isLoading || isSubmitting
  const isPasswordMode = mode === 'login' || mode === 'register'
  const hasValidEmail = emailPattern.test(normalizedEmail)
  const canSubmit =
    !isBusy &&
    hasValidEmail &&
    (mode !== 'register' || normalizeLandingName(username).length > 0) &&
    (!isPasswordMode || password.length >= 8) &&
    (mode !== 'register' || confirmPassword.length > 0)

  useEffect(() => {
    if (!isLandingEntry) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setIsIntroGreetingVisible(false)
    }, landingIntroDurationMs)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isLandingEntry])

  const applyEmailCheckResult = useCallback((checkedEmail: string, result: AccountEmailCheckResponse) => {
    if (result.registered) {
      const knownName = readStoredLandingNameForEmail(checkedEmail) || deriveNameFromEmail(checkedEmail)
      setStoredName(knownName)
      setMode('login')
      setLocalNotice('找到登录记录，请输入密码登录。')
      return
    }

    setStoredName('')
    setUsername('')
    setMode('register')
    setLocalNotice('没有找到登录记录，请输入用户名并设置密码注册。')
  }, [])

  useEffect(() => {
    if (!isLandingEntry || isAuthenticated || isLoading || mode !== 'identity' || !hasValidEmail) {
      return undefined
    }

    let isCancelled = false
    const timerId = window.setTimeout(() => {
      setLocalError(null)

      const knownName = readStoredLandingNameForEmail(normalizedEmail)
      if (knownName) {
        setStoredName(knownName)
        setMode('login')
        setLocalNotice('找到登录记录，请输入密码登录。')
        return
      }

      setLocalNotice('正在检查邮箱登录记录...')
      void onCheckEmailRegistration(normalizedEmail)
        .then((result) => {
          if (!isCancelled) {
            applyEmailCheckResult(normalizedEmail, result)
          }
        })
        .catch((lookupError) => {
          if (!isCancelled) {
            setLocalNotice(null)
            setLocalError(lookupError instanceof Error ? lookupError.message : '账号检测失败。')
          }
        })
    }, 520)

    return () => {
      isCancelled = true
      window.clearTimeout(timerId)
    }
  }, [
    applyEmailCheckResult,
    hasValidEmail,
    isAuthenticated,
    isLandingEntry,
    isLoading,
    mode,
    normalizedEmail,
    onCheckEmailRegistration,
  ])

  if (!isLandingEntry) {
    return <>{children}</>
  }

  const resetEmailCheck = (nextEmail: string) => {
    setEmail(nextEmail)
    setMode('identity')
    setStoredName('')
    setPassword('')
    setConfirmPassword('')
    setLocalError(null)
    setLocalNotice(null)
  }

  const persistDisplayName = () => {
    const nextName = normalizeLandingName(username) || resolveStoredLandingName(storedName, email) || deriveNameFromEmail(email)
    if (nextName) {
      writeStoredLandingName(nextName, email)
      setStoredName(nextName)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    setLocalNotice(null)

    const normalizedName = normalizeLandingName(username)

    if (!hasValidEmail) {
      setLocalError('请输入有效的邮箱地址。')
      return
    }

    try {
      if (mode === 'identity') {
        const knownName = readStoredLandingNameForEmail(normalizedEmail)
        if (knownName) {
          setStoredName(knownName)
          setMode('login')
          setLocalNotice('找到登录记录，请输入密码登录。')
          return
        }

        const result = await onCheckEmailRegistration(normalizedEmail)
        applyEmailCheckResult(normalizedEmail, result)
        return
      }

      if (password.length < 8) {
        setLocalError('密码至少 8 个字符。')
        return
      }

      if (mode === 'register') {
        if (!normalizedName) {
          setLocalError('请输入用户名。')
          return
        }

        if (confirmPassword !== password) {
          setLocalError('两次输入的密码不一致。')
          return
        }

        const result = await onRegister(normalizedEmail, password)
        writeStoredLandingName(normalizedName, normalizedEmail)
        setStoredName(normalizedName)
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setLocalNotice(
          result.message ||
          `确认邮件已发送到 ${result.email || normalizedEmail}，请先完成邮箱确认后再登录。`,
        )
        return
      }

      await onLogin(normalizedEmail, password)
      persistDisplayName()
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : '账号请求失败。')
    }
  }

  const scrollToSite = () => {
    siteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="dd-landing-shell">
      <section className="dd-landing" aria-label="ddzhilian 落地页">
        <div className="dd-landing__panel">
          <p className="dd-landing__greeting" aria-live="polite">
            {shouldShowIntroGreeting ? (
              <>我是，ddzhilian</>
            ) : displayedGreetingName ? (
              <>
                你好，{displayedGreetingName}
                <span className="dd-landing__cursor" aria-hidden="true">_</span>
              </>
            ) : (
              <>
                你好，<span className="dd-landing__cursor" aria-hidden="true">_</span>
              </>
            )}
          </p>

          {isAuthenticated ? (
            <button type="button" className="dd-landing__enter" onClick={scrollToSite}>
              进入网站
            </button>
          ) : (
            <form className="dd-landing__form" onSubmit={handleSubmit}>
              <input
                type="email"
                autoComplete="email"
                placeholder="输入邮箱"
                value={email}
                disabled={isBusy}
                onChange={(event) => resetEmailCheck(event.target.value)}
              />
              {mode === 'register' ? (
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="输入用户名"
                  value={username}
                  disabled={isBusy}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setLocalError(null)
                  }}
                />
              ) : null}
              {isPasswordMode ? (
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'login' ? '输入登录密码' : '设置密码'}
                  value={password}
                  disabled={isBusy}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setLocalError(null)
                  }}
                />
              ) : null}
              {mode === 'register' ? (
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="确认密码"
                  value={confirmPassword}
                  disabled={isBusy}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setLocalError(null)
                  }}
                />
              ) : null}
              <button type="submit" className="dd-landing__submit" disabled={!canSubmit}>
                {isLoading
                  ? '检测登录状态...'
                  : isSubmitting
                    ? mode === 'identity'
                      ? '检索中...'
                      : '处理中...'
                    : mode === 'identity'
                      ? '下一步'
                      : mode === 'login'
                        ? '登录'
                        : '注册'}
              </button>
            </form>
          )}

          {localNotice ? <p className="dd-landing__hint">{localNotice}</p> : null}
          {localError || error ? <p className="dd-landing__error">{localError ?? error}</p> : null}
        </div>
      </section>

      <section
        ref={siteRef}
        className={`dd-landing__site${isAuthenticated ? '' : ' is-locked'}`}
        aria-label="ddzhilian 网站"
      >
        {isAuthenticated ? children : <LandingFeaturePreview />}
      </section>
    </div>
  )
}
