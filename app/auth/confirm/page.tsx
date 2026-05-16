import type { Metadata } from 'next'
import { AuthConfirmPage } from '../../../src/app/components/AuthConfirmPage'

export const metadata: Metadata = {
  title: '邮箱确认 | ddzhilian',
}

export default function Page() {
  return <AuthConfirmPage />
}
