import { describe, expect, it } from 'vitest'
import {
  applyDefaultPlantUmlFont,
  buildDockerArgs,
  isPngBuffer,
  normalizePlantUmlStderr,
} from '../server/src/code-runner/plantuml-docker-runner'

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
        defaultFontName: 'Noto Sans CJK SC',
        maxSourceBytes: 64 * 1024,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    })

    expect(args).toContain('-i')
    expect(args).toContain('JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 -Dsun.java2d.fontpath=/usr/share/fonts')
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
        defaultFontName: 'Noto Sans CJK SC',
        maxSourceBytes: 64 * 1024,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    })

    expect(args).toContain('--volume')
    expect(args).toContain('/usr/share/fonts:/usr/share/fonts:ro')
  })

  it('injects the default font into uml diagrams', () => {
    const source = [
      '@startuml',
      'actor 用户',
      '@enduml',
    ].join('\n')

    expect(applyDefaultPlantUmlFont(source, 'Noto Sans CJK SC')).toBe([
      '@startuml',
      'skinparam defaultFontName "Noto Sans CJK SC"',
      'actor 用户',
      '@enduml',
    ].join('\n'))
  })

  it('keeps an explicit PlantUML default font', () => {
    const source = [
      '@startuml',
      'skinparam defaultFontName "Arial"',
      'actor 用户',
      '@enduml',
    ].join('\n')

    expect(applyDefaultPlantUmlFont(source, 'Noto Sans CJK SC')).toBe(source)
  })

  it('does not inject font settings into non-uml PlantUML formats', () => {
    const source = [
      '@startjson',
      '{ "name": "用户" }',
      '@endjson',
    ].join('\n')

    expect(applyDefaultPlantUmlFont(source, 'Noto Sans CJK SC')).toBe(source)
  })

  it('removes Java tool option notices from stderr', () => {
    expect(normalizePlantUmlStderr([
      'Picked up JAVA_TOOL_OPTIONS: -Dfile.encoding=UTF-8 -Dsun.java2d.fontpath=/usr/share/fonts',
      '',
    ].join('\n'))).toBe('')
  })

  it('keeps real PlantUML stderr after removing Java notices', () => {
    expect(normalizePlantUmlStderr([
      'Picked up JAVA_TOOL_OPTIONS: -Dfile.encoding=UTF-8',
      'Some PlantUML error',
    ].join('\n'))).toBe('Some PlantUML error')
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
