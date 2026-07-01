import type { DragEvent, ReactNode } from 'react'
import type { OnlineDeviceListItem } from '../types'
import { PeerActionsMenu } from './PeerActionsMenu'

type DeviceCardProps = {
  device: OnlineDeviceListItem
  deviceKind: string
  icon: ReactNode
  transportTone: string
  transportLabel: string
  trustLabel: string
  isSelected: boolean
  isDropTarget: boolean
  onSelect: (deviceId: string) => void
  onSendFile: (deviceId: string) => void
  onSendText: (deviceId: string) => void
  onTrustDevice: (deviceId: string) => void
  onShowDetail: (deviceId: string) => void
  onDragEnter: (deviceId: string) => void
  onDragOver: (deviceId: string) => void
  onDragLeave: (deviceId: string) => void
  onDropFiles: (deviceId: string, event: DragEvent<HTMLElement>) => void
}

export function DeviceCard({
  device,
  deviceKind,
  icon,
  transportTone,
  transportLabel,
  trustLabel,
  isSelected,
  isDropTarget,
  onSelect,
  onSendFile,
  onSendText,
  onTrustDevice,
  onShowDetail,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDropFiles,
}: DeviceCardProps) {
  return (
    <article
      className={[
        'dd-snaplink__workbench-device',
        isSelected ? 'is-selected' : '',
        isDropTarget ? 'is-drop-target' : '',
      ].filter(Boolean).join(' ')}
      data-device-id={device.deviceId}
      data-trust-label={trustLabel}
      onDragEnter={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDragEnter(device.deviceId)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
        onDragOver(device.deviceId)
      }}
      onDragLeave={(event) => {
        event.stopPropagation()
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDragLeave(device.deviceId)
        }
      }}
      onDrop={(event) => onDropFiles(device.deviceId, event)}
    >
      <button
        type="button"
        className="dd-snaplink__workbench-device-main"
        onClick={() => onSelect(device.deviceId)}
      >
        <span className={`dd-snaplink__workbench-device-icon is-${deviceKind}`}>
          {icon}
        </span>
        <span className="dd-snaplink__workbench-device-copy">
          <span className="dd-snaplink__workbench-device-title">
            <strong>{device.deviceName}</strong>
            <em>{device.platform}</em>
          </span>
          <span className="dd-snaplink__workbench-device-meta">
            <span className={`dd-snaplink__transport-badge is-${transportTone}`}>{transportLabel}</span>
            <span className={`dd-snaplink__trust-badge ${trustLabel === '已信任' ? 'is-trusted' : 'is-pending'}`}>
              {trustLabel}
            </span>
            <span>{device.lastSeenLabel}</span>
          </span>
        </span>
      </button>
      <div className="dd-snaplink__workbench-device-actions">
        <PeerActionsMenu
          trusted={trustLabel === '已信任'}
          onSend={() => onSendFile(device.deviceId)}
          onSendText={() => onSendText(device.deviceId)}
          onTrust={() => onTrustDevice(device.deviceId)}
          onDetail={() => onShowDetail(device.deviceId)}
        />
      </div>
    </article>
  )
}
