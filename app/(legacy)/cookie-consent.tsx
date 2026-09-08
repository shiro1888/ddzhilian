'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

const cookieConsentStorageKey = 'ddzhilian_cookie_notice_ack'
const cookieConsentResetEvent = 'ddzhilian:cookie-consent-reset'
const cookieConsentAdsValue = 'ads'

export function CookieConsentNotice() {
  const [canLoadAds, setCanLoadAds] = useState(false)

  useEffect(() => {
    const syncStoredConsent = () => {
      try {
        const storedConsent = window.localStorage.getItem(cookieConsentStorageKey)
        setCanLoadAds(storedConsent === cookieConsentAdsValue)
      } catch {
        setCanLoadAds(false)
      }
    }

    syncStoredConsent()
    window.addEventListener(cookieConsentResetEvent, syncStoredConsent)

    return () => {
      window.removeEventListener(cookieConsentResetEvent, syncStoredConsent)
    }
  }, [])

  return canLoadAds ? (
    <Script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6789129259270412"
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  ) : null
}
