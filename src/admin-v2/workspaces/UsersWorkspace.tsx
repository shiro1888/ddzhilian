'use client'

import { useState } from 'react'
import type {
  AdminUserQuotaUpdate,
  AdminUserSummary,
  AdminUsersSnapshot,
} from '@/lib/ddzhilian-types'
import { adminSelectClassName, formatDateTime, formatInteger, normalizeNonNegativeInteger } from '@/admin-v2/format'
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

type AdminV2UsersWorkspaceProps = {
  users: AdminUsersSnapshot | null | undefined
  isSaving: boolean
  onSaveQuota: (userId: string, quota: AdminUserQuotaUpdate) => Promise<boolean>
}

type UserSortKey = 'createdAt' | 'updatedAt' | 'quota'
type UserSortDirection = 'asc' | 'desc'

function createQuotaDraft(user: AdminUserSummary) {
  return {
    imageQuotaUsed: String(user.imageQuotaUsed),
    imagePaidQuotaRemaining: String(user.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: String(user.imagePaidQuotaUsed),
  }
}

function AdminUserRow({
  user,
  isSaving,
  onSaveQuota,
}: Readonly<{
  user: AdminUserSummary
  isSaving: boolean
  onSaveQuota: (userId: string, quota: AdminUserQuotaUpdate) => Promise<boolean>
}>) {
  const [draft, setDraft] = useState(createQuotaDraft(user))
  const [message, setMessage] = useState<string | null>(null)

  const nextQuota = {
    imageQuotaUsed: normalizeNonNegativeInteger(draft.imageQuotaUsed),
    imagePaidQuotaRemaining: normalizeNonNegativeInteger(draft.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: normalizeNonNegativeInteger(draft.imagePaidQuotaUsed),
  }
  const isValid =
    nextQuota.imageQuotaUsed !== null
    && nextQuota.imagePaidQuotaRemaining !== null
    && nextQuota.imagePaidQuotaUsed !== null
  const isDirty =
    draft.imageQuotaUsed !== String(user.imageQuotaUsed)
    || draft.imagePaidQuotaRemaining !== String(user.imagePaidQuotaRemaining)
    || draft.imagePaidQuotaUsed !== String(user.imagePaidQuotaUsed)

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="grid gap-1">
          <span className="font-medium">{user.email || '未记录邮箱'}</span>
          <span className="text-xs text-muted-foreground">{user.id}</span>
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="1"
          value={draft.imageQuotaUsed}
          disabled={isSaving}
          onChange={(event) => {
            setDraft((current) => ({ ...current, imageQuotaUsed: event.target.value }))
            setMessage(null)
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="1"
          value={draft.imagePaidQuotaRemaining}
          disabled={isSaving}
          onChange={(event) => {
            setDraft((current) => ({ ...current, imagePaidQuotaRemaining: event.target.value }))
            setMessage(null)
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="1"
          value={draft.imagePaidQuotaUsed}
          disabled={isSaving}
          onChange={(event) => {
            setDraft((current) => ({ ...current, imagePaidQuotaUsed: event.target.value }))
            setMessage(null)
          }}
        />
      </TableCell>
      <TableCell>{formatDateTime(user.imageQuotaPeriodStartedAt)}</TableCell>
      <TableCell>{formatDateTime(user.createdAt)}</TableCell>
      <TableCell>{formatDateTime(user.updatedAt)}</TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isSaving || !isDirty || !isValid}
            onClick={async () => {
              if (!isValid) {
                setMessage('额度只能填写非负整数。')
                return
              }

              const ok = await onSaveQuota(user.id, {
                imageQuotaUsed: nextQuota.imageQuotaUsed!,
                imagePaidQuotaRemaining: nextQuota.imagePaidQuotaRemaining!,
                imagePaidQuotaUsed: nextQuota.imagePaidQuotaUsed!,
              })
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

export function AdminV2UsersWorkspace({
  users,
  isSaving,
  onSaveQuota,
}: AdminV2UsersWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const [sortKey, setSortKey] = useState<UserSortKey>('updatedAt')
  const [sortDirection, setSortDirection] = useState<UserSortDirection>('desc')

  const accountUsers = users?.users ?? []
  const freeQuotaUsed = accountUsers.reduce((sum, user) => sum + user.imageQuotaUsed, 0)
  const paidQuotaRemaining = accountUsers.reduce((sum, user) => sum + user.imagePaidQuotaRemaining, 0)
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const matchedUsers = normalizedQuery
    ? accountUsers.filter((user) => (user.email || '').toLowerCase().includes(normalizedQuery))
    : accountUsers
  const sortMultiplier = sortDirection === 'asc' ? 1 : -1
  const filteredUsers = [...matchedUsers].sort((left, right) => {
    if (sortKey === 'quota') {
      return (left.imagePaidQuotaRemaining - right.imagePaidQuotaRemaining) * sortMultiplier
    }

    const leftTime = Date.parse(left[sortKey] ?? '') || 0
    const rightTime = Date.parse(right[sortKey] ?? '') || 0
    return (leftTime - rightTime) * sortMultiplier
  })

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const visibleUsers = filteredUsers.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)

  const updateSort = (nextKey: UserSortKey) => {
    setPageIndex(0)
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>用户额度</CardTitle>
          <CardDescription>
            当前页面继续沿用前端本地搜索、排序、分页；保存时只回写 `/api/admin/users/quota`。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_16rem]">
          <Input
            type="search"
            value={searchQuery}
            placeholder="按邮箱搜索"
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
            <Badge variant="outline">账号 {formatInteger(accountUsers.length)}</Badge>
            <Badge variant="outline">免费已用 {formatInteger(freeQuotaUsed)}</Badge>
            <Badge variant="outline">付费剩余 {formatInteger(paidQuotaRemaining)}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账号额度列表</CardTitle>
          <CardDescription>
            {users?.configured
              ? `已加载 ${formatInteger(accountUsers.length)} 个账号。`
              : 'Supabase 未配置时不会返回账号列表。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!users ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              正在等待后台用户快照。
            </div>
          ) : !users.configured ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              当前后端未配置 Supabase，账号数据暂不可用。
            </div>
          ) : users.error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-10 text-center text-sm text-destructive">
              {users.error}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              没有匹配的账号。
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>免费额度已用</TableHead>
                    <TableHead>
                      <button type="button" className="font-medium text-foreground" onClick={() => updateSort('quota')}>
                        付费剩余
                      </button>
                    </TableHead>
                    <TableHead>付费已用</TableHead>
                    <TableHead>额度周期</TableHead>
                    <TableHead>
                      <button type="button" className="font-medium text-foreground" onClick={() => updateSort('createdAt')}>
                        创建时间
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium text-foreground" onClick={() => updateSort('updatedAt')}>
                        更新时间
                      </button>
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => (
                    <AdminUserRow
                      key={`${user.id}:${user.imageQuotaUsed}:${user.imagePaidQuotaRemaining}:${user.imagePaidQuotaUsed}:${user.updatedAt ?? ''}`}
                      user={user}
                      isSaving={isSaving}
                      onSaveQuota={onSaveQuota}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {formatInteger(filteredUsers.length)} 条 · 第 {safePageIndex + 1} / {totalPages} 页
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
