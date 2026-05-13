import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminUserQuotaUpdate, AdminUserSummary, AdminUsersSnapshot } from '../../../lib/ddzhilian-types'
import { exportToCsv, formatDateTime, formatInteger } from './constants'
import { AdminTableSkeleton } from './Skeleton'

type AdminUserSortKey = 'createdAt' | 'updatedAt' | 'quota'
type AdminUserSortDirection = 'asc' | 'desc'

function createUserQuotaDraft(user: AdminUserSummary): Record<keyof AdminUserQuotaUpdate, string> {
  return {
    imageQuotaUsed: String(user.imageQuotaUsed),
    imagePaidQuotaRemaining: String(user.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: String(user.imagePaidQuotaUsed),
  }
}

function normalizeQuotaDraftValue(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function UserManagementWorkspace({
  users,
  isUpdatingUser,
  onUserQuotaUpdate,
}: {
  users: AdminUsersSnapshot | null
  isUpdatingUser: boolean
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const [sortKey, setSortKey] = useState<AdminUserSortKey>('updatedAt')
  const [sortDirection, setSortDirection] = useState<AdminUserSortDirection>('desc')
  const accountUsers = users?.users ?? []
  const freeQuotaUsed = accountUsers.reduce((sum, user) => sum + user.imageQuotaUsed, 0)
  const paidQuotaRemaining = accountUsers.reduce((sum, user) => sum + user.imagePaidQuotaRemaining, 0)
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const matchedUsers = normalizedSearchQuery
    ? accountUsers.filter((user) => (user.email || '').toLowerCase().includes(normalizedSearchQuery))
    : accountUsers
  const sortMultiplier = sortDirection === 'asc' ? 1 : -1
  const filteredUsers = [...matchedUsers].sort((a, b) => {
    if (sortKey === 'quota') {
      return (a.imagePaidQuotaRemaining - b.imagePaidQuotaRemaining) * sortMultiplier
    }

    const aTime = Date.parse(a[sortKey] ?? '') || 0
    const bTime = Date.parse(b[sortKey] ?? '') || 0
    return (aTime - bTime) * sortMultiplier
  })
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const visibleUsers = filteredUsers.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)

  const updateSort = (nextSortKey: AdminUserSortKey) => {
    setPageIndex(0)
    if (sortKey === nextSortKey) {
      setSortDirection((previous) => previous === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortKey(nextSortKey)
    setSortDirection('desc')
  }

  const exportUsers = () => {
    exportToCsv('ddzhilian-users.csv', filteredUsers.map((user) => ({
      email: user.email || '',
      id: user.id,
      imageQuotaUsed: user.imageQuotaUsed,
      imagePaidQuotaRemaining: user.imagePaidQuotaRemaining,
      imagePaidQuotaUsed: user.imagePaidQuotaUsed,
      imageQuotaPeriodStartedAt: user.imageQuotaPeriodStartedAt || '',
      createdAt: user.createdAt || '',
      updatedAt: user.updatedAt || '',
    })))
  }

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card">
        <div className="dd-admin-card__head">
          <div>
            <p>用户管理</p>
            <h3>Supabase Users</h3>
            <span>
              {users?.configured
                ? '已从 Supabase Auth 加载 ' + formatInteger(accountUsers.length) + ' 个账号，并合并 user_profiles 额度'
                : 'Supabase 未配置时不会读取账号列表'}
            </span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(accountUsers.length)}</strong>
              账号
            </span>
            <span>
              <strong>{formatInteger(freeQuotaUsed)}</strong>
              免费已用
            </span>
            <span>
              <strong>{formatInteger(paidQuotaRemaining)}</strong>
              付费剩余
            </span>
          </div>
        </div>

        <div className="dd-admin-table-toolbar">
          <Input
            type="search"
            placeholder="按邮箱搜索"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setPageIndex(0)
            }}
          />
          <select
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
          <Button type="button" className="dd-button dd-button--dark" disabled={filteredUsers.length === 0} onClick={exportUsers}>
            导出 CSV
          </Button>
        </div>

        {!users ? (
          <AdminTableSkeleton rows={6} />
        ) : !users.configured ? (
          <p className="dd-admin-user-message">当前后端未配置 Supabase，账号数据暂不可用。</p>
        ) : users.error ? (
          <p className="dd-admin-user-message is-error">{users.error}</p>
        ) : accountUsers.length === 0 ? (
          <p className="dd-admin-user-message">Supabase Auth 暂无账号记录。</p>
        ) : filteredUsers.length === 0 ? (
          <p className="dd-admin-user-message">没有匹配的账号。</p>
        ) : (
          <>
            <div className="dd-admin-user-table-wrap">
              <table className="dd-admin-user-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>免费额度已用</th>
                    <th>
                      <button type="button" className="dd-admin-sort-button" onClick={() => updateSort('quota')}>付费剩余</button>
                    </th>
                    <th>付费已用</th>
                    <th>额度周期</th>
                    <th>
                      <button type="button" className="dd-admin-sort-button" onClick={() => updateSort('createdAt')}>创建时间</button>
                    </th>
                    <th>
                      <button type="button" className="dd-admin-sort-button" onClick={() => updateSort('updatedAt')}>更新时间</button>
                    </th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <AdminUserRow
                      key={user.id + ':' + user.imageQuotaUsed + ':' + user.imagePaidQuotaRemaining + ':' + user.imagePaidQuotaUsed + ':' + (user.updatedAt ?? '')}
                      user={user}
                      isSaving={isUpdatingUser}
                      onUserQuotaUpdate={onUserQuotaUpdate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dd-admin-pagination">
              <span>{filteredUsers.length} 条 · 第 {safePageIndex + 1} / {totalPages} 页</span>
              <button type="button" disabled={safePageIndex === 0} onClick={() => setPageIndex((page) => Math.max(0, page - 1))}>上一页</button>
              <button type="button" disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex((page) => Math.min(totalPages - 1, page + 1))}>下一页</button>
            </div>
          </>
        )}
      </section>
    </section>
  )
}

function AdminUserRow({
  user,
  isSaving,
  onUserQuotaUpdate,
}: {
  user: AdminUserSummary
  isSaving: boolean
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
}) {
  const [draft, setDraft] = useState(createUserQuotaDraft(user))
  const [message, setMessage] = useState<string | null>(null)
  const nextQuota = {
    imageQuotaUsed: normalizeQuotaDraftValue(draft.imageQuotaUsed),
    imagePaidQuotaRemaining: normalizeQuotaDraftValue(draft.imagePaidQuotaRemaining),
    imagePaidQuotaUsed: normalizeQuotaDraftValue(draft.imagePaidQuotaUsed),
  }
  const isValid =
    nextQuota.imageQuotaUsed !== null &&
    nextQuota.imagePaidQuotaRemaining !== null &&
    nextQuota.imagePaidQuotaUsed !== null
  const isDirty =
    draft.imageQuotaUsed !== String(user.imageQuotaUsed) ||
    draft.imagePaidQuotaRemaining !== String(user.imagePaidQuotaRemaining) ||
    draft.imagePaidQuotaUsed !== String(user.imagePaidQuotaUsed)

  const updateDraft = (field: keyof AdminUserQuotaUpdate, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setMessage(null)
  }

  const saveQuota = () => {
    if (!isValid) {
      setMessage('额度只能填写非负整数。')
      return
    }

    void onUserQuotaUpdate(user.id, nextQuota as AdminUserQuotaUpdate)
      .then(() => {
        setMessage('已保存')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '保存失败')
      })
  }

  return (
    <tr>
      <td>
        <div className="dd-admin-user-cell">
          <strong>{user.email || '未记录邮箱'}</strong>
          <small>{user.id}</small>
        </div>
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imageQuotaUsed}
          onChange={(event) => updateDraft('imageQuotaUsed', event.target.value)}
        />
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imagePaidQuotaRemaining}
          onChange={(event) => updateDraft('imagePaidQuotaRemaining', event.target.value)}
        />
      </td>
      <td>
        <Input
          type="number"
          min="0"
          step="1"
          className="dd-admin-user-quota-input"
          value={draft.imagePaidQuotaUsed}
          onChange={(event) => updateDraft('imagePaidQuotaUsed', event.target.value)}
        />
      </td>
      <td>{formatDateTime(user.imageQuotaPeriodStartedAt)}</td>
      <td>{formatDateTime(user.createdAt)}</td>
      <td>{formatDateTime(user.updatedAt)}</td>
      <td>
        <div className="dd-admin-user-row-actions">
          <Button
            type="button"
            className="dd-button dd-button--primary dd-admin-user-save"
            disabled={isSaving || !isDirty || !isValid}
            onClick={saveQuota}
          >
            {isSaving ? '保存中' : '保存'}
          </Button>
          {message ? <small className={message === '已保存' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>
      </td>
    </tr>
  )
}

