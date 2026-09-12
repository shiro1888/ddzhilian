import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAccountAuth } from '../src/lib/use-account-auth'

const user = { id: 'user', email: 'test@example.test' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('account session lifecycle', () => {
  it('does not interrupt an in-flight login with a session refresh', async () => {
    let finishLogin!: (response: Response) => void
    const fetcher = vi.fn((url: string) => url.endsWith('/login')
      ? new Promise<Response>((resolve) => { finishLogin = resolve })
      : Promise.resolve(json({ authenticated: false })))
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useAccountAuth())
    await act(async () => {})
    let loggingIn!: Promise<unknown>
    await act(async () => { loggingIn = result.current.login('test@example.test', 'test-only') })
    await act(async () => result.current.refreshSession())
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => { finishLogin(json({ authenticated: true, user })); await loggingIn })
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.user).toEqual(user)
  })
  it('does not overwrite a successful login with an older anonymous session response', async () => {
    let finishRefresh!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/session')
      ? new Promise<Response>((resolve) => { finishRefresh = resolve })
      : Promise.resolve(json({ authenticated: true, user }))))
    const { result } = renderHook(() => useAccountAuth())
    await act(async () => { await result.current.login('test@example.test', 'test-only') })
    await act(async () => finishRefresh(json({ authenticated: false })))
    expect(result.current.user).toEqual(user)
    expect(result.current.isLoading).toBe(false)
  })

  it('retains the current account and reports a failed server logout', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/logout')
      ? json({ error: 'server unavailable' }, 503)
      : json({ authenticated: true, user })))
    const { result } = renderHook(() => useAccountAuth())
    await act(async () => {})
    expect(result.current.user).toEqual(user)
    await act(async () => { await expect(result.current.logout()).rejects.toThrow('server unavailable') })
    expect(result.current.user).toEqual(user)
    expect(result.current.error).toBe('server unavailable')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('does not restore a logged out account from a delayed refresh', async () => {
    let finishRefresh!: (response: Response) => void
    const fetcher = vi.fn(async () => json({ authenticated: true, user }))
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useAccountAuth())
    await act(async () => {})
    fetcher.mockImplementation((...args: unknown[]) => String(args[0]).endsWith('/logout')
      ? Promise.resolve(json({ authenticated: false }))
      : new Promise<Response>((resolve) => { finishRefresh = resolve }))
    let pending!: Promise<void>
    await act(async () => { pending = result.current.refreshSession() })
    await act(async () => { await result.current.logout() })
    await act(async () => { finishRefresh(json({ authenticated: true, user })); await pending })
    expect(result.current.user).toBeNull()
  })
})
