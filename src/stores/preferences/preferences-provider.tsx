'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { StoreApi } from 'zustand'
import { useStore } from 'zustand'
import type { FontKey } from '@/lib/fonts/registry'
import { fontRegistry } from '@/lib/fonts/registry'
import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from '@/lib/preferences/layout'
import { THEME_MODE_VALUES, THEME_PRESET_VALUES } from '@/lib/preferences/theme'
import { applyThemeMode, subscribeToSystemTheme } from '@/lib/preferences/theme-utils'
import { createPreferencesStore, type PreferencesState } from '@/stores/preferences/preferences-store'

const PreferencesStoreContext = createContext<StoreApi<PreferencesState> | null>(null)
const FONT_VALUES = Object.keys(fontRegistry) as FontKey[]

function getSafeValue<T extends string>(raw: string | null, allowed: readonly T[]) {
  if (!raw) {
    return undefined
  }

  return allowed.includes(raw as T) ? raw as T : undefined
}

function readDomState(): Partial<PreferencesState> {
  const root = document.documentElement
  const themeModeAttribute = getSafeValue(root.getAttribute('data-theme-mode'), THEME_MODE_VALUES)
  const resolvedThemeMode = root.classList.contains('dark') ? 'dark' : 'light'

  return {
    themeMode: themeModeAttribute ?? resolvedThemeMode,
    resolvedThemeMode,
    themePreset: getSafeValue(root.getAttribute('data-theme-preset'), THEME_PRESET_VALUES),
    font: getSafeValue(root.getAttribute('data-font'), FONT_VALUES),
    contentLayout: getSafeValue(root.getAttribute('data-content-layout'), CONTENT_LAYOUT_VALUES),
    navbarStyle: getSafeValue(root.getAttribute('data-navbar-style'), NAVBAR_STYLE_VALUES),
    sidebarVariant: getSafeValue(root.getAttribute('data-sidebar-variant'), SIDEBAR_VARIANT_VALUES),
    sidebarCollapsible: getSafeValue(root.getAttribute('data-sidebar-collapsible'), SIDEBAR_COLLAPSIBLE_VALUES),
  }
}

export function PreferencesStoreProvider({
  children,
  themeMode,
  themePreset,
  font,
  contentLayout,
  navbarStyle,
}: Readonly<{
  children: ReactNode
  themeMode: PreferencesState['themeMode']
  themePreset: PreferencesState['themePreset']
  font: PreferencesState['font']
  contentLayout: PreferencesState['contentLayout']
  navbarStyle: PreferencesState['navbarStyle']
}>) {
  const [store] = useState(() => createPreferencesStore({
    themeMode,
    themePreset,
    font,
    contentLayout,
    navbarStyle,
  }))
  const domSnapshotRef = useRef<Partial<PreferencesState> | null>(null)

  useEffect(() => {
    const domState = readDomState()
    domSnapshotRef.current = domState
    store.setState((previous) => ({
      ...previous,
      ...domState,
      isSynced: true,
    }))
  }, [store])

  useEffect(() => {
    let unsubscribeMedia: (() => void) | undefined

    const applyFromMode = (mode: PreferencesState['themeMode']) => {
      unsubscribeMedia?.()
      const resolvedThemeMode = applyThemeMode(mode)
      store.setState((previous) => ({
        ...previous,
        resolvedThemeMode,
      }))

      if (mode === 'system') {
        unsubscribeMedia = subscribeToSystemTheme((nextMode) => {
          const resolved = applyThemeMode('system')
          store.setState((previous) => ({
            ...previous,
            resolvedThemeMode: nextMode ?? resolved,
          }))
        })
      }
    }

    const initialMode = domSnapshotRef.current?.themeMode ?? store.getState().themeMode
    applyFromMode(initialMode)

    const unsubscribeStore = store.subscribe((state, previous) => {
      if (state.themeMode !== previous.themeMode) {
        applyFromMode(state.themeMode)
      }
    })

    return () => {
      unsubscribeMedia?.()
      unsubscribeStore()
    }
  }, [store])

  return (
    <PreferencesStoreContext.Provider value={store}>
      {children}
    </PreferencesStoreContext.Provider>
  )
}

export function usePreferencesStore<T>(selector: (state: PreferencesState) => T) {
  const store = useContext(PreferencesStoreContext)
  if (!store) {
    throw new Error('Missing PreferencesStoreProvider')
  }

  return useStore(store, selector)
}
