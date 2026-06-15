import { describe, expect, it } from 'vitest'
import { isPngBuffer } from '../server/src/code-runner/plantuml-docker-runner'

describe('plantuml docker runner helpers', () => {
  it('detects PNG output by signature', () => {
    const pngBuffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0x00,
    ])

    expect(isPngBuffer(pngBuffer)).toBe(true)
  })

  it('rejects non-PNG output', () => {
    expect(isPngBuffer(Buffer.from('<svg></svg>'))).toBe(false)
  })
})
