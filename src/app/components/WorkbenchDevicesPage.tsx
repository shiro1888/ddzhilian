import { Monitor, Search } from 'lucide-react'
import type { OnlineDeviceListItem } from '../types'
import {
  resolveSnapLinkDeviceKind,
  resolveSnapLinkTransportMode,
  resolveSnapLinkTrustLabel,
} from '../../lib/device-display'
import { DeviceRadar } from './DeviceRadar'
import { WorkbenchDeviceIcon } from './WorkbenchDeviceIcon'

type WorkbenchDevicesPageProps = {
  devices: OnlineDeviceListItem[]
  selectedDevice: OnlineDeviceListItem | null
  onlineCount: number
  searchQuery: string
  isScanning: boolean
  trustedDeviceIds: Set<string>
  onSearchChange: (value: string) => void
  onRescan: () => void
  onSelectDevice: (deviceId: string) => void
  onSendText: (deviceId: string) => void
  onSendFile: (deviceId: string) => void
  onTrustDevice: (deviceId: string) => void
}

export function WorkbenchDevicesPage({
  devices,
  selectedDevice,
  onlineCount,
  searchQuery,
  isScanning,
  trustedDeviceIds,
  onSearchChange,
  onRescan,
  onSelectDevice,
  onSendText,
  onSendFile,
  onTrustDevice,
}: WorkbenchDevicesPageProps) {
  const activeDevice = selectedDevice
  const normalizedDeviceQuery = searchQuery.trim().toLowerCase()
  const filteredDeviceItems = devices.filter((device) => {
    if (!normalizedDeviceQuery) {
      return true
    }

    return [
      device.deviceName,
      device.platform,
      device.scopeLabel,
      device.shortCode,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedDeviceQuery)
  })

  return (
    <section className="dd-snaplink__devices-shell" aria-label="设备工作台">
      <aside className="dd-snaplink__conversation-side" aria-label="设备列表">
        <div className="dd-snaplink__conversation-side-head">
          <span>
            <strong>设备</strong>
            <small>{onlineCount.toString()} 台设备在线 · 可互传</small>
          </span>
          <button type="button" onClick={onRescan}>
            查找
          </button>
        </div>
        <label className="dd-snaplink__conversation-side-search">
          <span className="sr-only">搜索设备</span>
          <Search size={15} strokeWidth={1.9} aria-hidden="true" />
          <input
            value={searchQuery}
            placeholder="搜索设备"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="清空设备搜索"
              onClick={() => onSearchChange('')}
            >
              ×
            </button>
          ) : null}
        </label>
        <div className={`dd-snaplink__conversation-side-list${isScanning ? ' is-scanning' : ''}`}>
          {filteredDeviceItems
            .map((device) => {
              const isActive = activeDevice?.deviceId === device.deviceId

              return (
                <button
                  key={device.deviceId}
                  type="button"
                  className={[
                    'dd-snaplink__conversation-row',
                    'is-device',
                    isActive ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectDevice(device.deviceId)}
                  onDoubleClick={() => onSendText(device.deviceId)}
                  title={`打开 ${device.deviceName}（双击进入会话）`}
                >
                  <span className="dd-snaplink__conversation-avatar is-device" aria-hidden="true">
                    {Array.from(device.deviceName.trim() || '设')[0].toUpperCase()}
                    <i className="is-online" />
                  </span>
                  <span className="dd-snaplink__conversation-main">
                    <span className="dd-snaplink__conversation-title">
                      <strong>{device.deviceName}</strong>
                      <em>{device.platform || '设备'}</em>
                    </span>
                    <small>{device.scopeLabel || '附近设备'} · {device.lastSeenLabel || '在线'}</small>
                  </span>
                  <span className="dd-snaplink__conversation-side-meta">
                    <small>在线</small>
                    <em>{device.shortCode || '直连'}</em>
                  </span>
                </button>
              )
            })}
          {devices.length === 0 ? (
            <div className="dd-snaplink__conversation-empty">
              暂无附近设备
            </div>
          ) : filteredDeviceItems.length === 0 ? (
            <div className="dd-snaplink__conversation-empty">
              没有找到相关设备
            </div>
          ) : null}
        </div>
      </aside>

      <div className="dd-snaplink__devices-detail" aria-label="设备详情">
        <DeviceRadar
          devices={devices}
          selectedDeviceId={activeDevice?.deviceId ?? null}
          renderIcon={(device) => <WorkbenchDeviceIcon device={device} />}
          onSelect={onSelectDevice}
          onOpenConversation={onSendText}
        />
        {activeDevice ? (
          <section className="dd-snaplink__device-detail-card">
            <span className={`dd-snaplink__device-detail-icon is-${resolveSnapLinkDeviceKind(activeDevice.platform)}`} aria-hidden="true">
              <WorkbenchDeviceIcon device={activeDevice} />
            </span>
            <span className="dd-snaplink__device-detail-copy">
              <strong>{activeDevice.deviceName}</strong>
              <small>{activeDevice.scopeLabel || '附近设备'} · {activeDevice.lastSeenLabel || '在线'}</small>
            </span>
            <dl className="dd-snaplink__device-detail-meta">
              <div>
                <dt>平台</dt>
                <dd>{activeDevice.platform || '未知'}</dd>
              </div>
              <div>
                <dt>短码</dt>
                <dd>{activeDevice.shortCode || '未公开'}</dd>
              </div>
              <div>
                <dt>连接</dt>
                <dd>{resolveSnapLinkTransportMode(activeDevice).label}</dd>
              </div>
              <div>
                <dt>信任</dt>
                <dd>{resolveSnapLinkTrustLabel(activeDevice, trustedDeviceIds.has(activeDevice.deviceId))}</dd>
              </div>
            </dl>
            <div className="dd-snaplink__device-detail-actions">
              <button type="button" className="is-primary" onClick={() => onSendFile(activeDevice.deviceId)}>
                发文件
              </button>
              <button type="button" onClick={() => onSendText(activeDevice.deviceId)}>
                发消息
              </button>
              <button type="button" onClick={() => onTrustDevice(activeDevice.deviceId)}>
                校验设备
              </button>
            </div>
          </section>
        ) : (
          <section className="dd-snaplink__device-detail-card is-empty">
            <span className="dd-snaplink__device-detail-icon is-empty" aria-hidden="true">
              <Monitor size={24} strokeWidth={1.8} />
            </span>
            <span className="dd-snaplink__device-detail-copy">
              <strong>等待附近设备</strong>
              <small>让另一台设备打开 DD直连，保持在同一网络或登录同一账号。</small>
            </span>
            <div className="dd-snaplink__device-detail-actions">
              <button type="button" className="is-primary" onClick={onRescan}>
                重新查找
              </button>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
