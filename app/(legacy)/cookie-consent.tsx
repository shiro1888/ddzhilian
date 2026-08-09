'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

const cookieConsentStorageKey = 'ddzhilian_cookie_notice_ack'
const cookieConsentResetEvent = 'ddzhilian:cookie-consent-reset'
const cookieConsentAdsValue = 'ads'
const cookieConsentEssentialValue = 'essential'

export function CookieConsentNotice() {
  const [isVisible, setIsVisible] = useState(false)
  const [canLoadAds, setCanLoadAds] = useState(false)

  useEffect(() => {
    const syncStoredConsent = () => {
      try {
        const storedConsent = window.localStorage.getItem(cookieConsentStorageKey)
        setCanLoadAds(storedConsent === cookieConsentAdsValue)
        setIsVisible(storedConsent !== cookieConsentAdsValue && storedConsent !== cookieConsentEssentialValue)
      } catch {
        setCanLoadAds(false)
        setIsVisible(true)
      }
    }

    syncStoredConsent()
    window.addEventListener(cookieConsentResetEvent, syncStoredConsent)

    return () => {
      window.removeEventListener(cookieConsentResetEvent, syncStoredConsent)
    }
  }, [])

  const saveConsent = (value: typeof cookieConsentAdsValue | typeof cookieConsentEssentialValue) => {
    try {
      window.localStorage.setItem(cookieConsentStorageKey, value)
    } catch {
      // Ignore storage failures; the notice can be dismissed for this session.
    }

    setCanLoadAds(value === cookieConsentAdsValue)
    setIsVisible(false)
  }

  return (
    <>
      {canLoadAds ? (
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6789129259270412"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      ) : null}
      {isVisible ? (
        <aside
          aria-label="Cookie 与广告提示"
          className="dd-cookie-notice"
        >
          <span className="dd-cookie-notice__body">
            <span className="dd-cookie-notice__icon" aria-hidden="true">
              <ShieldCheck size={19} strokeWidth={1.9} />
            </span>
            <span className="dd-cookie-notice__copy">
              <strong>隐私与 Cookie</strong>
              <small>
                我们只在本机保存运行所需的基础偏好。只有你同意后，才会加载 Google 广告脚本。
              </small>
              <span>
                <Link href="/privacy">隐私政策</Link>
                <Link href="/advertising">广告说明</Link>
              </span>
            </span>
          </span>
          <span className="dd-cookie-notice__actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => saveConsent(cookieConsentEssentialValue)}
            >
              仅必要
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => saveConsent(cookieConsentAdsValue)}
            >
              允许广告
            </button>
          </span>
        </aside>
      ) : null}
    </>
  )
}
