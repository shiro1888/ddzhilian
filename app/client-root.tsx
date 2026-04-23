'use client'

import dynamic from 'next/dynamic'

const BrowserApp = dynamic(() => import('../src/BrowserApp'), {
  ssr: false,
})

export function ClientRoot() {
  return <BrowserApp />
}
