/**
 * Web Audio API 纯原生提示音合成引擎
 * 零音频文件依赖，使用纯正弦波/三角波平滑包络线合成 Apple/iOS 风格清脆轻柔提示音
 */

let sharedAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    if (!sharedAudioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx()
      }
    }

    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => undefined)
    }

    return sharedAudioContext
  } catch {
    sharedAudioContext = null
    return null
  }
}

/**
 * 播放消息发送轻柔向上微弹跳音 (520Hz -> 1040Hz 80ms)
 */
export function playMessageSentSound(enabled = true): void {
  if (!enabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.08)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.12, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.08)
  } catch {
    // 忽略在静音模式或被拦截时的异常
  }
}

/**
 * 播放消息接收清脆双音和弦 (880Hz + 1760Hz 140ms)
 */
export function playMessageReceivedSound(enabled = true): void {
  if (!enabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    // 主音 880Hz (A5)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now)
    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.linearRampToValueAtTime(0.14, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.14)

    // 泛音 1760Hz (A6)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1760, now + 0.03)
    gain2.gain.setValueAtTime(0.001, now + 0.03)
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.05)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.03)
    osc2.stop(now + 0.16)
  } catch {
    // 忽略异常
  }
}

/**
 * 播放新设备发现 / 连入欢愉 3 音微阶梯 (C5 523Hz -> E5 659Hz -> G5 784Hz)
 */
export function playPeerConnectedSound(enabled = true): void {
  if (!enabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const notes = [523.25, 659.25, 783.99]
    const stepDuration = 0.045

    notes.forEach((freq, index) => {
      const startTime = now + index * stepDuration
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)

      gain.gain.setValueAtTime(0.001, startTime)
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startTime)
      osc.stop(startTime + 0.08)
    })
  } catch {
    // 忽略异常
  }
}

/**
 * 播放传输完成纯净三角波和弦 (659Hz -> 1318Hz 180ms)
 */
export function playTransferCompletedSound(enabled = true): void {
  if (!enabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(659.25, now)
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.06)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.18)
  } catch {
    // 忽略异常
  }
}
