import type { NavView } from './types'

export const DEFAULT_VIEW: NavView = 'connect'

export const viewPaths: Record<NavView, string> = {
  connect: '/connect',
  send: '/send',
  receive: '/receive',
  text: '/text',
  chat: '/chat',
  image: '/image',
  sessions: '/sessions',
  admin: '/admin',
}

export function pathForView(view: NavView) {
  return viewPaths[view]
}

export function resolveViewFromPathname(pathname: string): NavView {
  const normalizedPath = pathname === '/' ? viewPaths[DEFAULT_VIEW] : pathname

  for (const [view, path] of Object.entries(viewPaths) as Array<[NavView, string]>) {
    if (normalizedPath === path) {
      return view
    }
  }

  return DEFAULT_VIEW
}
