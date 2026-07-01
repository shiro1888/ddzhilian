import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

function createTestStorage() {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(String(key)) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(String(key))
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(String(key), String(value))
    }),
  } satisfies Storage
}

const localStorageMock = createTestStorage()
const sessionStorageMock = createTestStorage()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: sessionStorageMock,
})

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: sessionStorageMock,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

HTMLElement.prototype.scrollIntoView = vi.fn()
HTMLElement.prototype.hasPointerCapture = vi.fn()
HTMLElement.prototype.releasePointerCapture = vi.fn()

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string
    children: ReactNode
    prefetch?: boolean
    [key: string]: unknown
  }) => (
    <a href={href} data-prefetch={prefetch ? 'true' : undefined} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/providers',
  useSearchParams: () => new URLSearchParams(),
}))
