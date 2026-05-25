import type { ReactNode } from 'react'
import { AdminV2ProtectedLayout } from '@/admin-v2/shell'

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <AdminV2ProtectedLayout>{children}</AdminV2ProtectedLayout>
}
