import type { ReactNode } from 'react'

import type { OnlineDeviceListItem } from '../types'

type DeviceRadarProps = {
  devices: OnlineDeviceListItem[]
  selectedDeviceId?: string | null
  renderIcon: (device: OnlineDeviceListItem) => ReactNode
  onSelect: (deviceId: string) => void
  onOpenConversation: (deviceId: string) => void
}

const fallbackPositions = [
  { left: 71, top: 28 },
  { left: 23, top: 39 },
  { left: 79, top: 70 },
  { left: 35, top: 83 },
  { left: 15, top: 66 },
  { left: 57, top: 18 },
  { left: 88, top: 48 },
  { left: 49, top: 73 },
]

function hashDeviceId(value: string) {
  let hash = 0
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

function resolveRadarPosition(device: OnlineDeviceListItem, index: number) {
  if (index < fallbackPositions.length) {
    return fallbackPositions[index]
  }

  const hash = hashDeviceId(device.deviceId || device.deviceName)
  const angle = (hash % 360) * (Math.PI / 180)
  const radius = 30 + (hash % 22)
  return {
    left: 50 + Math.cos(angle) * radius,
    top: 50 + Math.sin(angle) * radius,
  }
}

export function DeviceRadar({
  devices,
  selectedDeviceId,
  renderIcon,
  onSelect,
  onOpenConversation,
}: DeviceRadarProps) {
  const visibleDevices = devices.slice(0, 8)

  return (
    <section className="dd-snaplink__device-radar-card" aria-label="附近设备">
      <div className="dd-snaplink__device-radar-head">
        <strong>附近设备</strong>
        <small>{devices.length.toString()} 台设备在线</small>
      </div>
      <div className="dd-snaplink__device-radar" role="list">
        <span className="dd-snaplink__device-radar-sweep" aria-hidden="true" />
        <span className="dd-snaplink__device-radar-ring is-outer" aria-hidden="true" />
        <span className="dd-snaplink__device-radar-ring is-middle" aria-hidden="true" />
        <span className="dd-snaplink__device-radar-ring is-inner" aria-hidden="true" />
        <span className="dd-snaplink__device-radar-self" aria-label="我的设备">
          我
        </span>
        {visibleDevices.map((device, index) => {
          const position = resolveRadarPosition(device, index)
          const isSelected = device.deviceId === selectedDeviceId

          return (
            <button
              key={device.deviceId}
              type="button"
              className={`dd-snaplink__device-radar-node${isSelected ? ' is-selected' : ''}`}
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
              }}
              aria-pressed={isSelected}
              title={`${device.deviceName} · ${device.platform || '设备'}`}
              onClick={() => onSelect(device.deviceId)}
              onDoubleClick={() => onOpenConversation(device.deviceId)}
              role="listitem"
            >
              <span className="dd-snaplink__device-radar-ping" aria-hidden="true" />
              <span className="dd-snaplink__device-radar-icon" aria-hidden="true">
                {renderIcon(device)}
              </span>
              <span className="dd-snaplink__device-radar-label">
                {device.deviceName}
              </span>
            </button>
          )
        })}
      </div>
      <p className="dd-snaplink__device-radar-note">
        点选设备查看详情，双击进入会话。
      </p>
    </section>
  )
}
