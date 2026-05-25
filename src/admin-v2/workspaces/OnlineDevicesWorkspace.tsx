'use client'

import { useEffect, useState } from 'react'
import type {
  AdminOnlineDeviceSummary,
  AdminOnlineDevicesSnapshot,
} from '@/lib/ddzhilian-types'
import { adminSelectClassName, formatDateTime, formatInteger } from '@/admin-v2/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AdminV2OnlineDevicesWorkspaceProps = {
  onlineDevices: AdminOnlineDevicesSnapshot | null
  isRefreshing: boolean
  isSaving: boolean
  onRefresh: () => Promise<void>
  onRename: (deviceId: string, deviceName: string) => Promise<boolean>
}

function matchesDeviceQuery(device: AdminOnlineDeviceSummary, query: string) {
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

function OnlineDeviceRow({
  device,
  isSaving,
  onRename,
}: Readonly<{
  device: AdminOnlineDeviceSummary
  isSaving: boolean
  onRename: (deviceId: string, deviceName: string) => Promise<boolean>
}>) {
  const [draftName, setDraftName] = useState(device.deviceName)
  const [message, setMessage] = useState<string | null>(null)
  const nextName = draftName.trim()
  const isDirty = nextName !== device.deviceName
  const isValid = nextName.length > 0

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="grid gap-1">
          <Input
            value={draftName}
            disabled={isSaving}
            maxLength={80}
            onChange={(event) => {
              setDraftName(event.target.value)
              setMessage(null)
            }}
          />
          <span className="text-xs text-muted-foreground">{device.deviceId}</span>
        </div>
      </TableCell>
      <TableCell>{device.platform || '未知'}</TableCell>
      <TableCell>{device.accountId || '未关联账号'}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant="secondary">在线</Badge>
          <span className="text-xs text-muted-foreground">
            {device.discoverable ? '可发现' : '隐藏'} · {device.autoConnect ? '自动连接' : '手动连接'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {formatInteger(device.roomCount)} / {formatInteger(device.sessionCount)}
      </TableCell>
      <TableCell>{formatDateTime(device.lastSeenAt)}</TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isSaving || !isDirty || !isValid}
            onClick={async () => {
              if (!isValid) {
                setMessage('名称不能为空。')
                return
              }

              const ok = await onRename(device.deviceId, nextName)
              setMessage(ok ? '已保存' : '保存失败')
            }}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
          {message ? (
            <span className={`text-xs ${message === '已保存' ? 'text-emerald-600' : 'text-destructive'}`}>
              {message}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function AdminV2OnlineDevicesWorkspace({
  onlineDevices,
  isRefreshing,
  isSaving,
  onRefresh,
  onRename,
}: AdminV2OnlineDevicesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    void onRefresh()
    const interval = window.setInterval(() => {
      void onRefresh()
    }, 2000)

    return () => {
      window.clearInterval(interval)
    }
  }, [onRefresh])

  const devices = onlineDevices?.devices ?? []
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredDevices = devices
    .filter((device) => matchesDeviceQuery(device, normalizedQuery))
    .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const visibleDevices = filteredDevices.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)
  const linkedAccountCount = devices.filter((device) => device.accountId).length

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>在线设备</CardTitle>
              <CardDescription>
                当前页面按 2 秒轮询 `GET /api/admin/online-devices`，改名后只回写在线设备快照。
              </CardDescription>
            </div>
            <Button type="button" variant="outline" disabled={isRefreshing} onClick={() => void onRefresh()}>
              {isRefreshing ? '刷新中...' : '立即刷新'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <Input
            type="search"
            value={searchQuery}
            placeholder="按名称、设备 ID、平台或账号搜索"
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setPageIndex(0)
            }}
          />
          <select
            className={adminSelectClassName}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPageIndex(0)
            }}
          >
            <option value={10}>10 / 页</option>
            <option value={20}>20 / 页</option>
            <option value={50}>50 / 页</option>
          </select>
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">在线 {formatInteger(devices.length)}</Badge>
            <Badge variant="outline">已关联 {formatInteger(linkedAccountCount)}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>设备列表</CardTitle>
          <CardDescription>
            当前快照时间：{formatDateTime(onlineDevices?.loadedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {onlineDevices && filteredDevices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              没有匹配的在线设备。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>显示名称</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>房间 / 会话</TableHead>
                  <TableHead>最近在线</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDevices.map((device) => (
                  <OnlineDeviceRow
                    key={`${device.deviceId}:${device.deviceName}:${device.lastSeenAt}`}
                    device={device}
                    isSaving={isSaving}
                    onRename={onRename}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {filteredDevices.length > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {formatInteger(filteredDevices.length)} 条 · 第 {safePageIndex + 1} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={safePageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}>
                  上一页
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
