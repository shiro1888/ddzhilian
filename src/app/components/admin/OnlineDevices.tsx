import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type {
  AdminOnlineDeviceNameUpdate,
  AdminOnlineDeviceSummary,
  AdminOnlineDevicesSnapshot,
} from '../../../lib/ddzhilian-types'
import { formatDateTime, formatInteger } from './constants'
import { AdminTableSkeleton } from './Skeleton'

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function matchesDeviceSearch(device: AdminOnlineDeviceSummary, query: string) {
  if (!query) {
    return true
  }

  return [
    device.deviceName,
    device.deviceId,
    device.platform,
    device.accountId ?? '',
  ].some((value) => value.toLowerCase().includes(query))
}

export function OnlineDevicesWorkspace({
  onlineDevices,
  isRenamingDevice,
  onDeviceRename,
}: {
  onlineDevices: AdminOnlineDevicesSnapshot | null
  isRenamingDevice: boolean
  onDeviceRename: (input: AdminOnlineDeviceNameUpdate) => Promise<void>
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const devices = onlineDevices?.devices ?? []
  const linkedAccountCount = devices.filter((device) => device.accountId).length
  const visibleDeviceCount = devices.filter((device) => device.discoverable).length
  const normalizedSearchQuery = normalizeSearchText(searchQuery)
  const filteredDevices = devices.filter((device) => matchesDeviceSearch(device, normalizedSearchQuery))

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card dd-admin-online-card">
        <div className="dd-admin-card__head">
          <div>
            <p>在线人员</p>
            <h3>Online Devices</h3>
            <span>当前通过 WebSocket 注册的在线设备，改名后会同步到在线客户端。</span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(devices.length)}</strong>
              在线
            </span>
            <span>
              <strong>{formatInteger(linkedAccountCount)}</strong>
              已关联账号
            </span>
            <span>
              <strong>{formatInteger(visibleDeviceCount)}</strong>
              可发现
            </span>
          </div>
        </div>

        <div className="dd-admin-table-toolbar">
          <Input
            type="search"
            placeholder="按名称、设备 ID、设备平台或账号搜索"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {!onlineDevices ? (
          <AdminTableSkeleton rows={6} />
        ) : devices.length === 0 ? (
          <p className="dd-admin-user-message">当前没有在线设备。</p>
        ) : filteredDevices.length === 0 ? (
          <p className="dd-admin-user-message">没有匹配的在线设备。</p>
        ) : (
          <div className="dd-admin-user-table-wrap">
            <table className="dd-admin-user-table dd-admin-online-table">
              <thead>
                <tr>
                  <th>显示名称</th>
                  <th>设备平台</th>
                  <th>账号</th>
                  <th>状态</th>
                  <th>房间 / 会话</th>
                  <th>最近在线</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <OnlineDeviceRow
                    key={`${device.deviceId}:${device.deviceName}`}
                    device={device}
                    isSaving={isRenamingDevice}
                    onDeviceRename={onDeviceRename}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

function OnlineDeviceRow({
  device,
  isSaving,
  onDeviceRename,
}: {
  device: AdminOnlineDeviceSummary
  isSaving: boolean
  onDeviceRename: (input: AdminOnlineDeviceNameUpdate) => Promise<void>
}) {
  const [deviceNameDraft, setDeviceNameDraft] = useState(device.deviceName)
  const [message, setMessage] = useState<string | null>(null)
  const nextDeviceName = deviceNameDraft.trim()
  const isDirty = nextDeviceName !== device.deviceName
  const isValid = nextDeviceName.length > 0

  const saveDeviceName = () => {
    if (!isValid) {
      setMessage('名称不能为空。')
      return
    }

    void onDeviceRename({
      deviceId: device.deviceId,
      deviceName: nextDeviceName,
    })
      .then(() => setMessage('已保存'))
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '保存失败')
      })
  }

  return (
    <tr>
      <td>
        <div className="dd-admin-user-cell">
          <Input
            type="text"
            className="dd-admin-online-name-input"
            value={deviceNameDraft}
            maxLength={80}
            onChange={(event) => {
              setDeviceNameDraft(event.target.value)
              setMessage(null)
            }}
          />
          <small>{device.deviceId}</small>
        </div>
      </td>
      <td>{device.platform || '未知'}</td>
      <td>
        <span className="dd-admin-online-account">{device.accountId || '未关联账号'}</span>
      </td>
      <td>
        <span className="dd-admin-status-dot is-green">在线</span>
        <small className="dd-admin-online-status-detail">
          {device.discoverable ? '可发现' : '隐藏'} · {device.autoConnect ? '自动连接' : '手动连接'}
        </small>
      </td>
      <td>
        {formatInteger(device.roomCount)} / {formatInteger(device.sessionCount)}
      </td>
      <td>{formatDateTime(device.lastSeenAt)}</td>
      <td>
        <div className="dd-admin-user-row-actions">
          <Button
            type="button"
            className="dd-button dd-button--primary dd-admin-user-save"
            disabled={isSaving || !isDirty || !isValid}
            onClick={saveDeviceName}
          >
            {isSaving ? '保存中' : '保存'}
          </Button>
          {message ? <small className={message === '已保存' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>
      </td>
    </tr>
  )
}
