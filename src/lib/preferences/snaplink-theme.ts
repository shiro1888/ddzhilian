import type { CSSProperties } from 'react'
import type { ResolvedThemeMode, ThemeMode } from './theme'

export type SnapLinkThemeColorTarget = 'self' | 'peer' | 'ai'
export type SnapLinkThemeColors = Record<SnapLinkThemeColorTarget, string>
export type SnapLinkThemeStyle = CSSProperties & {
  '--snap-theme-self': string
  '--snap-theme-self-text': string
  '--snap-theme-peer': string
  '--snap-theme-peer-text': string
  '--snap-theme-ai': string
  '--snap-theme-ai-text': string
}

export const snapLinkThemeStorageKey = 'ddzhilian:snaplink-theme-colors'
export const snapLinkThemeModePreferenceKey = 'theme_mode'
export const snapLinkThemeModeLocalStorageKey = 'dd_theme'
export const snapLinkPreferenceCookieMaxAgeSeconds = 60 * 60 * 24 * 365
export const snapLinkThemeColorPattern = /^#[0-9A-Fa-f]{6}$/
export const snapLinkThemeSubmitDebounceMs = 700

export const snapLinkDefaultThemeColors: SnapLinkThemeColors = {
  self: '#6366F1',
  peer: '#FFFFFF',
  ai: '#EEF2FF',
}
export const snapLinkThemeColorOptions: Array<{ label: string; colors: SnapLinkThemeColors }> = [
  { label: '品牌蓝紫', colors: { self: '#6366F1', peer: '#FFFFFF', ai: '#EEF2FF' } },
  { label: '珊瑚', colors: { self: '#F9887F', peer: '#FFF4F2', ai: '#FFE8E5' } },
  { label: '天空蓝', colors: { self: '#6EA8FE', peer: '#F3F7FF', ai: '#EAF2FF' } },
  { label: '青柠', colors: { self: '#B7E36D', peer: '#F6FAEE', ai: '#EEF8D8' } },
  { label: '暖橙', colors: { self: '#F6B35D', peer: '#FFF7ED', ai: '#FFEED8' } },
]

export function normalizeSnapLinkThemeColor(value: string, fallback: string) {
  const normalizedValue = value.trim()
  return snapLinkThemeColorPattern.test(normalizedValue)
    ? normalizedValue.toUpperCase()
    : fallback
}

export function normalizeSnapLinkThemeColors(value: Partial<Record<SnapLinkThemeColorTarget, string>>) {
  return {
    self: normalizeSnapLinkThemeColor(value.self ?? '', snapLinkDefaultThemeColors.self),
    peer: normalizeSnapLinkThemeColor(value.peer ?? '', snapLinkDefaultThemeColors.peer),
    ai: normalizeSnapLinkThemeColor(value.ai ?? '', snapLinkDefaultThemeColors.ai),
  }
}

export function readStoredSnapLinkThemeColors() {
  if (typeof window === 'undefined') {
    return snapLinkDefaultThemeColors
  }

  try {
    const storedValue = window.localStorage.getItem(snapLinkThemeStorageKey)
    if (!storedValue) {
      return snapLinkDefaultThemeColors
    }

    const parsedValue: unknown = JSON.parse(storedValue)
    if (typeof parsedValue === 'string') {
      return normalizeSnapLinkThemeColors({ self: parsedValue })
    }

    if (parsedValue && typeof parsedValue === 'object') {
      return normalizeSnapLinkThemeColors(parsedValue as Partial<Record<SnapLinkThemeColorTarget, string>>)
    }
  } catch {
    return snapLinkDefaultThemeColors
  }

  return snapLinkDefaultThemeColors
}

export function isSnapLinkThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readSnapLinkCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const prefix = `${name}=`
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))

  if (!cookie) {
    return null
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return cookie.slice(prefix.length)
  }
}

export function writeSnapLinkClientPreference(name: string, value: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${snapLinkPreferenceCookieMaxAgeSeconds}; SameSite=Lax`
}

export function readStoredSnapLinkThemeMode(): ThemeMode {
  if (typeof document === 'undefined') {
    return 'light'
  }

  const domThemeMode = document.documentElement.getAttribute('data-theme-mode')
  if (isSnapLinkThemeMode(domThemeMode)) {
    return domThemeMode
  }

  const cookieThemeMode = readSnapLinkCookie(snapLinkThemeModePreferenceKey)
  if (isSnapLinkThemeMode(cookieThemeMode)) {
    return cookieThemeMode
  }

  if (typeof window !== 'undefined') {
    try {
      const localThemeMode = window.localStorage.getItem(snapLinkThemeModeLocalStorageKey)
      if (isSnapLinkThemeMode(localThemeMode)) {
        return localThemeMode
      }
    } catch {
      // Ignore unavailable localStorage and fall back to light mode.
    }
  }

  return 'light'
}

export function resolveInitialSnapLinkThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== 'system') {
    return mode
  }

  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

export function getSnapLinkThemeContrastColor(color: string) {
  const normalizedColor = normalizeSnapLinkThemeColor(color, snapLinkDefaultThemeColors.self)
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16)
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16)
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16)
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness >= 150 ? '#18181B' : '#FFFFFF'
}
