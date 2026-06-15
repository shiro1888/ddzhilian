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
        fontPath: '',
        maxSourceBytes: 64 * 1024,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    })

    expect(args).toContain('-i')
    expect(args).toContain('JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8')
    expect(args.at(-2)).toBe('aplr/plantuml')
    expect(args.at(-1)).toBe('-tpng')
    expect(args).not.toContain('-pipe')
  })

  it('mounts a configured font directory as read-only', () => {
    const args = buildDockerArgs({
      containerName: 'ddz-plantuml-test',
      config: {
        enabled: true,
        dockerImage: 'aplr/plantuml',
        timeoutMs: 20_000,
        memoryMb: 256,
        cpus: 1,
        pidsLimit: 64,
        fontPath: '/usr/share/fonts',
        maxSourceBytes: 64 * 1024,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    })

    expect(args).toContain('--volume')
    expect(args).toContain('/usr/share/fonts:/usr/local/share/fonts/plantuml:ro')
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
