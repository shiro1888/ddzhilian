import type { FileConversationEntry, OnlineDeviceListItem } from '../app/types'

export function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(Math.max(progress, 0), 1)
}

export function resolveSnapLinkDeviceKind(platform: string) {
  const normalizedPlatform = platform.toLowerCase()

  if (/(iphone|android|phone|mobile|pixel|huawei|xiaomi|oppo|vivo)/i.test(normalizedPlatform)) {
    return 'phone'
  }

  if (/(ipad|tablet|pad)/i.test(normalizedPlatform)) {
    return 'tablet'
  }

  return 'desktop'
}

export function resolveSnapLinkTransportMode(device: OnlineDeviceListItem) {
  if (device.scopeLabel.includes('同一网络')) {
    return {
      label: '同一网络',
      tone: 'lan',
    } as const
  }

  if (device.scopeLabel.includes('同一账号')) {
    return {
      label: '同一账号',
      tone: 'remote',
    } as const
  }

  return {
    label: '可互传',
    tone: 'discoverable',
  } as const
}

export function resolveSnapLinkTrustLabel(device: OnlineDeviceListItem, isLocallyTrusted: boolean) {
  if (isLocallyTrusted || device.scopeLabel.includes('同一账号')) {
    return '已信任'
  }

  return '未验证'
}

export function isSnapLinkDeviceTrusted(device: OnlineDeviceListItem, trustedDeviceIds: Set<string>) {
  return trustedDeviceIds.has(device.deviceId) || device.scopeLabel.includes('同一账号')
}

export function formatSnapLinkDeviceFingerprint(device: OnlineDeviceListItem) {
  const source = device.pairToken || device.shortCode || device.deviceId
  const compact = source.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

  if (!compact) {
    return '未知'
  }

  return compact.slice(0, 12).replace(/(.{4})(?=.)/g, '$1 ')
}

export function resolveSnapLinkTransferStatus(file: FileConversationEntry) {
  const status = file.transferStatus

  if (status) {
    return status
  }

  if (file.tone === 'completed') {
    return 'completed'
  }

  if (file.tone === 'failed') {
    return 'failed'
  }

  if (file.tone === 'active') {
    return 'transferring'
  }

  return 'queued'
}

export function getSnapLinkTransferProgress(file: FileConversationEntry) {
  const status = resolveSnapLinkTransferStatus(file)

  if (status === 'completed') {
    return 1
  }

  if (status === 'transferring' || status === 'failed') {
    return clampProgress(file.progress)
  }

  return 0
}

export function isSnapLinkTransferActive(status: ReturnType<typeof resolveSnapLinkTransferStatus>) {
  return (
    status === 'queued' ||
    status === 'waiting_for_target' ||
    status === 'connecting' ||
    status === 'ready' ||
    status === 'transferring'
  )
}
