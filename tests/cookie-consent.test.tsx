import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CookieConsentNotice } from '../app/(legacy)/cookie-consent'

vi.mock('next/script', () => ({
  default: ({ src }: { src: string }) => <script data-testid="ad-script" src={src} />,
}))

describe('CookieConsentNotice', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('never renders the advertising consent prompt', async () => {
    render(<CookieConsentNotice />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Cookie 与广告提示')).not.toBeInTheDocument()
      expect(screen.queryByText('允许广告')).not.toBeInTheDocument()
    })
  })

  it('preserves an existing explicit advertising consent without showing a prompt', async () => {
    window.localStorage.setItem('ddzhilian_cookie_notice_ack', 'ads')
    render(<CookieConsentNotice />)

    expect(await screen.findByTestId('ad-script')).toHaveAttribute(
      'src',
      expect.stringContaining('pagead2.googlesyndication.com'),
    )
    expect(screen.queryByLabelText('Cookie 与广告提示')).not.toBeInTheDocument()
  })
})
