import { beforeEach, describe, expect, it } from 'vitest'

import {
  normalizeSnapLinkAvatarDataUrl,
  readStoredSnapLinkAvatar,
  writeStoredSnapLinkAvatar,
} from '../src/lib/device-preferences'

describe('SnapLink avatar preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('accepts a large safe raster image data URL without a product-level byte cap', () => {
    const avatarDataUrl = `data:image/webp;base64,${'A'.repeat(512 * 1024)}`

    expect(normalizeSnapLinkAvatarDataUrl(avatarDataUrl)).toBe(avatarDataUrl)
    writeStoredSnapLinkAvatar(avatarDataUrl)
    expect(readStoredSnapLinkAvatar()).toBe(avatarDataUrl)
  })

  it('rejects scriptable and external avatar sources', () => {
    expect(
      normalizeSnapLinkAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    ).toBeNull()
    expect(normalizeSnapLinkAvatarDataUrl('https://example.com/avatar.png')).toBeNull()
  })
})
