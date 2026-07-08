'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useEffect, useState } from 'react'

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
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            left: 16,
            zIndex: 80,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            maxWidth: 980,
            margin: '0 auto',
            padding: '14px 16px',
            border: '1px solid rgba(17, 24, 39, 0.12)',
            borderRadius: 18,
            background: 'rgba(255, 255, 255, 0.96)',
            boxShadow: '0 18px 54px rgba(15, 23, 42, 0.16)',
            color: '#1f2937',
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.65,
          }}
        >
          <span style={{ minWidth: 240, flex: '1 1 460px' }}>
            DD直连会使用必要的本地存储来保存基础偏好；如果你同意，我们也会加载 Google 广告脚本用于展示广告。
            你可以阅读{' '}
            <Link href="/privacy" style={{ color: '#047a3b' }}>
              隐私政策
            </Link>
            {' '}和{' '}
            <Link href="/advertising" style={{ color: '#047a3b' }}>
              广告说明
            </Link>
            了解更多。
          </span>
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => saveConsent(cookieConsentEssentialValue)}
              style={{
                minHeight: 38,
                padding: '0 14px',
                border: '1px solid rgba(17, 24, 39, 0.14)',
                borderRadius: 999,
                background: '#ffffff',
                color: '#1f2937',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              仅必要
            </button>
            <button
              type="button"
              onClick={() => saveConsent(cookieConsentAdsValue)}
              style={{
                minHeight: 38,
                padding: '0 16px',
                border: 0,
                borderRadius: 999,
                background: '#07c160',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              同意广告/Cookie
            </button>
          </span>
        </aside>
      ) : null}
    </>
  )
}
