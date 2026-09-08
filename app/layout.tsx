import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

const siteUrl = new URL(
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://dd.shiro1888.com')
)
const siteTitle = 'DD直连'
const siteDescription =
  'DD直连是一款面向个人和团队的局域网文件传输、文本同步与 AI 助手工具，支持浏览器直接使用、房间对话、图片工具和命令分享。'

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'DD直连',
  title: {
    default: siteTitle,
    template: '%s | DD直连',
  },
  description: siteDescription,
  keywords: [
    'DD直连',
    '局域网文件传输',
    '文件互传',
    '文本同步',
    'WebRTC 文件传输',
    '在线文件传输',
    'AI 助手',
  ],
  authors: [{ name: 'DD直连团队' }],
  creator: 'DD直连团队',
  publisher: 'DD直连',
  category: 'productivity',
  manifest: '/manifest.json',
  alternates: {
    canonical: siteUrl.toString(),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: siteUrl.toString(),
    siteName: 'DD直连',
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: new URL('/logo-dd-link.png', siteUrl).toString(),
        width: 512,
        height: 512,
        alt: 'DD直连',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
    images: [new URL('/logo-dd-link.png', siteUrl).toString()],
  },
  other: {
    'google-adsense-account': 'ca-pub-6789129259270412',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ddzhilian',
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl.toString()}#organization`,
      name: 'DD直连团队',
      url: siteUrl.toString(),
      logo: `${siteUrl.toString()}logo-dd-link.png`,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@dd.shiro1888.com',
        availableLanguage: ['zh-CN', 'en'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl.toString()}#website`,
      name: 'DD直连',
      alternateName: 'ddzhilian',
      url: siteUrl.toString(),
      inLanguage: 'zh-CN',
      publisher: {
        '@id': `${siteUrl.toString()}#organization`,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl.toString()}#software`,
      name: 'DD直连',
      alternateName: 'ddzhilian',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: siteUrl.toString(),
      description: siteDescription,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: {
        '@id': `${siteUrl.toString()}#organization`,
      },
    },
  ],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07c160',
}

const serviceWorkerBootstrapScript = process.env.NODE_ENV === 'production'
  ? `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').then((registration)=>registration.update()).catch(()=>{})})}`
  : `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.getRegistrations().then((registrations)=>registrations.forEach((registration)=>registration.unregister())).catch(()=>{});if(window.caches){window.caches.keys().then((keys)=>keys.forEach((key)=>window.caches.delete(key))).catch(()=>{})}})}`

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="128x128" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
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
