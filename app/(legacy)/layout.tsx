import type { ReactNode } from 'react'
import { CookieConsentNotice } from './cookie-consent'
import { ThemeBootScript } from '@/scripts/theme-boot'
import '@xterm/xterm/css/xterm.css'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/app/styles/snaplink-polish.css'
import '../../src/app/styles/snaplink-redesign.css'

export default function LegacyLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <>
      <ThemeBootScript />
      {children}
      <CookieConsentNotice />
    </>
  )
}
