'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`)
    const sync = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    mediaQuery.addEventListener('change', sync)
    sync()

    return () => {
      mediaQuery.removeEventListener('change', sync)
    }
  }, [])

  return Boolean(isMobile)
}
