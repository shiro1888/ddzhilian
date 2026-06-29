import type { ReactNode } from 'react'
import Script from 'next/script'
import { ThemeBootScript } from '@/scripts/theme-boot'
import '@xterm/xterm/css/xterm.css'
import '../../src/index.css'
import '../../src/App.css'

export default function LegacyLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <>
      <ThemeBootScript />
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6789129259270412"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      {children}
    </>
  )
}
