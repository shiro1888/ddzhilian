import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../src/index.css'
import '../src/App.css'

export const metadata: Metadata = {
  title: 'ddzhilian | 文件与文本互传',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    shortcut: [{ url: '/favicon.png', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6789129259270412"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
