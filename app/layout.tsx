import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'ddzhilian | 文件与文本互传',
  description: '局域网文件与文本互传工具',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    shortcut: [{ url: '/favicon.png', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ddzhilian',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07c160',
}

const serviceWorkerBootstrapScript = process.env.NODE_ENV === 'production'
  ? `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js')})}`
  : `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.getRegistrations().then((registrations)=>registrations.forEach((registration)=>registration.unregister()));if(window.caches){window.caches.keys().then((keys)=>keys.forEach((key)=>window.caches.delete(key)))}})}`

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: serviceWorkerBootstrapScript,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
