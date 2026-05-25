import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminV2Providers } from '@/admin-v2/providers'

export const metadata: Metadata = {
  title: '管理后台 V2 | ddzhilian',
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <AdminV2Providers>{children}</AdminV2Providers>
}
