import { useCallback, useEffect, useRef } from 'react'
import type { TouchEvent, WheelEvent } from 'react'

type LandingWelcomeProps = {
  onEnter: () => void
}

const autoEnterDelayMs = 2000
const wheelEnterThreshold = 18
const touchEnterThreshold = 32

export function LandingWelcome({ onEnter }: LandingWelcomeProps) {
  const touchStartYRef = useRef<number | null>(null)
  const hasEnteredRef = useRef(false)

  const enterTextApp = useCallback(() => {
    if (hasEnteredRef.current) {
      return
    }

    hasEnteredRef.current = true
    onEnter()
  }, [onEnter])

  useEffect(() => {
    const timerId = window.setTimeout(enterTextApp, autoEnterDelayMs)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [enterTextApp])

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.deltaY <= wheelEnterThreshold) {
      return
    }

    event.preventDefault()
    enterTextApp()
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current
    const currentY = event.touches[0]?.clientY
    if (startY === null || currentY === undefined || startY - currentY <= touchEnterThreshold) {
      return
    }

    event.preventDefault()
    touchStartYRef.current = null
    enterTextApp()
  }

  return (
    <section
      className="dd-landing dd-landing--welcome"
      aria-label="ddzhilian 欢迎页"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div className="dd-landing__panel dd-landing__panel--welcome">
        <p className="dd-landing__greeting dd-landing__greeting--welcome" aria-live="polite">
          我是，ddzhilian
          <span className="dd-landing__cursor" aria-hidden="true">_</span>
        </p>
      </div>
    </section>
  )
}
