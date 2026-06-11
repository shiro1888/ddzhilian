import type { NavView } from './types'

export const DEFAULT_VIEW: NavView = 'text'

export const viewPaths: Record<NavView, string> = {
  text: '/text',
  chat: '/chat',
  image: '/image',
  admin: '/admin',
  command: '/web-command',
}

const legacyTextPaths = new Set(['/', '/connect', '/send', '/receive', '/sessions'])

export function pathForView(view: NavView) {
  return viewPaths[view]
}

export function resolveViewFromPathname(pathname: string): NavView {
  const normalizedPath = legacyTextPaths.has(pathname) ? viewPaths[DEFAULT_VIEW] : pathname

  for (const [view, path] of Object.entries(viewPaths) as Array<[NavView, string]>) {
    if (normalizedPath === path) {
      return view
    }
  }

  return DEFAULT_VIEW
}
