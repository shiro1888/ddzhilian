'use client'

const cookieConsentStorageKey = 'ddzhilian_cookie_notice_ack'
const cookieConsentResetEvent = 'ddzhilian:cookie-consent-reset'

export function CookiePreferenceButton() {
  const resetCookiePreference = () => {
    try {
      window.localStorage.removeItem(cookieConsentStorageKey)
    } catch {
      // Ignore storage failures and still refresh so the notice can try to show again.
    }

    window.dispatchEvent(new Event(cookieConsentResetEvent))
  }

  return (
    <button
      type="button"
      onClick={resetCookiePreference}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 42,
        marginTop: 8,
        padding: '0 16px',
        border: '1px solid rgba(17, 24, 39, 0.12)',
        borderRadius: 999,
        background: '#ffffff',
        color: '#111827',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 900,
      }}
    >
      重新管理 Cookie 选择
    </button>
  )
}
