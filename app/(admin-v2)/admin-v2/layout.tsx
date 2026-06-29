import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminV2Providers } from '@/admin-v2/providers'

export const metadata: Metadata = {
  title: 'DD直连管理台',
}

export default function AdminV2Layout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <AdminV2Providers>{children}</AdminV2Providers>
}
