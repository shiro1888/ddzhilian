import type { ResolvedThemeMode, ThemeMode } from '@/lib/preferences/theme'

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  }

  return mode === 'dark' ? 'dark' : 'light'
}

export function applyThemeMode(mode: ThemeMode): ResolvedThemeMode {
  const resolved = resolveThemeMode(mode)
  const documentElement = document.documentElement

  documentElement.setAttribute('data-theme-mode', mode)
  documentElement.classList.add('disable-transitions')
  documentElement.classList.toggle('dark', resolved === 'dark')
  documentElement.style.colorScheme = resolved

  requestAnimationFrame(() => {
    documentElement.classList.remove('disable-transitions')
  })

  return resolved
}

export function subscribeToSystemTheme(onChange: (mode: ResolvedThemeMode) => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mediaQuery) {
    return () => undefined
  }

  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? 'dark' : 'light')
  }

  mediaQuery.addEventListener('change', listener)
  return () => {
    mediaQuery.removeEventListener('change', listener)
  }
}
