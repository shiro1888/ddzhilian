import { describe, expect, it } from 'vitest'
import { buildDockerArgs, isPngBuffer } from '../server/src/code-runner/plantuml-docker-runner'

describe('plantuml docker runner helpers', () => {
  it('renders PNG from interactive stdin without pipe mode', () => {
    const args = buildDockerArgs({
      containerName: 'ddz-plantuml-test',
      config: {
        enabled: true,
        dockerImage: 'aplr/plantuml',
        timeoutMs: 8000,
        memoryMb: 256,
        cpus: 1,
        pidsLimit: 64,
        maxSourceBytes: 64 * 1024,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    })

    expect(args).toContain('-i')
    expect(args.at(-2)).toBe('aplr/plantuml')
    expect(args.at(-1)).toBe('-tpng')
    expect(args).not.toContain('-pipe')
  })

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
