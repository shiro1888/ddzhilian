import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../src/index.css'
import '../src/App.css'

export const metadata: Metadata = {
  title: 'ddzhilian | 文件与文本互传',
  icons: {
    icon: [{ url: '/logo-dd-link.svg', type: 'image/svg+xml' }],
    shortcut: [{ url: '/logo-dd-link.svg', type: 'image/svg+xml' }],
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
      <body>{children}</body>
    </html>
  )
}
