import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../server/src/config'

const threeMonthRetentionMs = 90 * 24 * 60 * 60 * 1000

describe('server history retention config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps file, uploaded-image, text, and OCR history for 90 days by default', () => {
    vi.stubEnv('HISTORY_RETENTION_MS', '')
    vi.stubEnv('HISTORY_TEXT_RETENTION_MS', '')
    vi.stubEnv('OCR_HISTORY_RETENTION_MS', '')

    const config = loadConfig()

    expect(config.historyRetentionMs).toBe(threeMonthRetentionMs)
    expect(config.historyTextRetentionMs).toBe(threeMonthRetentionMs)
    expect(config.ocr.historyRetentionMs).toBe(threeMonthRetentionMs)
  })

  it('caps configured history retention at 90 days', () => {
    const overLimit = String(threeMonthRetentionMs + 24 * 60 * 60 * 1000)
    vi.stubEnv('HISTORY_RETENTION_MS', overLimit)
    vi.stubEnv('HISTORY_TEXT_RETENTION_MS', overLimit)
    vi.stubEnv('OCR_HISTORY_RETENTION_MS', overLimit)

    const config = loadConfig()

    expect(config.historyRetentionMs).toBe(threeMonthRetentionMs)
    expect(config.historyTextRetentionMs).toBe(threeMonthRetentionMs)
    expect(config.ocr.historyRetentionMs).toBe(threeMonthRetentionMs)
  })
})
