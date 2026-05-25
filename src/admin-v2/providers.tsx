import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fontVars } from '@/lib/fonts/registry'
import { PREFERENCE_DEFAULTS } from '@/lib/preferences/preferences-config'
import { ThemeBootScript } from '@/scripts/theme-boot'
import { PreferencesStoreProvider } from '@/stores/preferences/preferences-provider'
import { AdminV2SessionProvider } from '@/admin-v2/session'

export function AdminV2Providers({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <>
      <ThemeBootScript />
      <div
        data-admin-v2-root
        className={`${fontVars} min-h-screen`}
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
      >
        <TooltipProvider>
          <PreferencesStoreProvider
            themeMode={PREFERENCE_DEFAULTS.theme_mode}
            themePreset={PREFERENCE_DEFAULTS.theme_preset}
            font={PREFERENCE_DEFAULTS.font}
            contentLayout={PREFERENCE_DEFAULTS.content_layout}
            navbarStyle={PREFERENCE_DEFAULTS.navbar_style}
          >
            <AdminV2SessionProvider>
              {children}
              <Toaster position="top-right" richColors />
            </AdminV2SessionProvider>
          </PreferencesStoreProvider>
        </TooltipProvider>
      </div>
    </>
  )
}
