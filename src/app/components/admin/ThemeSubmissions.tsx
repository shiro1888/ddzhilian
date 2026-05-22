import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type {
  AdminThemeSubmission,
  AdminThemeSubmissionsSnapshot,
  SnapLinkThemeColors,
} from '../../../lib/ddzhilian-types'
import { exportToCsv, formatDateTime, formatInteger } from './constants'
import { AdminTableSkeleton } from './Skeleton'

const themeSubmissionPageSizeOptions = [10, 20, 50]

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function matchesThemeSubmissionSearch(submission: AdminThemeSubmission, query: string) {
  if (!query) {
    return true
  }

  return [
    submission.submissionId,
    submission.deviceId ?? '',
    submission.deviceName ?? '',
    submission.accountId ?? '',
    submission.source,
    submission.colors.self,
    submission.colors.peer,
    submission.colors.ai,
  ].some((value) => value.toLowerCase().includes(query))
}

function storageLabel(snapshot: AdminThemeSubmissionsSnapshot | null) {
  if (!snapshot) {
    return '正在加载主题反馈'
  }

  if (snapshot.storage === 'supabase') {
    return '已连接 Supabase 数据库'
  }

  if (snapshot.storage === 'local-fallback') {
    return '数据库读取失败，当前显示本地降级记录'
  }

  return 'Supabase 未配置，当前显示本地记录'
}

export function ThemeSubmissionsWorkspace({
  themeSubmissions,
}: {
  themeSubmissions: AdminThemeSubmissionsSnapshot | null
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const submissions = themeSubmissions?.submissions ?? []
  const normalizedSearchQuery = normalizeSearchText(searchQuery)
  const filteredSubmissions = submissions.filter((submission) =>
    matchesThemeSubmissionSearch(submission, normalizedSearchQuery),
  )
  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const visibleSubmissions = filteredSubmissions.slice(
    safePageIndex * pageSize,
    safePageIndex * pageSize + pageSize,
  )

  const exportThemeSubmissions = () => {
    exportToCsv('ddzhilian-theme-submissions.csv', filteredSubmissions.map((submission) => ({
      createdAt: submission.createdAt,
      selfColor: submission.colors.self,
      peerColor: submission.colors.peer,
      aiColor: submission.colors.ai,
      deviceName: submission.deviceName ?? '',
      deviceId: submission.deviceId ?? '',
      accountId: submission.accountId ?? '',
      source: submission.source,
      submissionId: submission.submissionId,
    })))
  }

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card dd-admin-theme-card">
        <div className="dd-admin-card__head">
          <div>
            <p>主题反馈</p>
            <h3>SnapLink Theme Beta</h3>
            <span>{storageLabel(themeSubmissions)}</span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(themeSubmissions?.stats.total ?? 0)}</strong>
              总提交
            </span>
            <span>
              <strong>{formatInteger(themeSubmissions?.stats.uniqueDevices ?? 0)}</strong>
              设备
            </span>
            <span>
              <strong>{formatDateTime(themeSubmissions?.stats.latestAt)}</strong>
              最新
            </span>
          </div>
        </div>

        <div className="dd-admin-table-toolbar">
          <Input
            type="search"
            placeholder="按设备、账号或色值搜索"
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
            {themeSubmissionPageSizeOptions.map((option) => (
              <option key={option} value={option}>{option} / 页</option>
            ))}
          </select>
          <Button
            type="button"
            className="dd-button dd-button--dark"
            disabled={filteredSubmissions.length === 0}
            onClick={exportThemeSubmissions}
          >
            导出 CSV
          </Button>
        </div>

        {!themeSubmissions ? (
          <AdminTableSkeleton rows={6} />
        ) : themeSubmissions.error && submissions.length === 0 ? (
          <p className="dd-admin-user-message is-error">{themeSubmissions.error}</p>
        ) : submissions.length === 0 ? (
          <p className="dd-admin-user-message">暂时没有主题配色提交。</p>
        ) : filteredSubmissions.length === 0 ? (
          <p className="dd-admin-user-message">没有匹配的主题配色提交。</p>
        ) : (
          <>
            {themeSubmissions.error ? (
              <p className="dd-admin-user-message is-error">{themeSubmissions.error}</p>
            ) : null}
            <div className="dd-admin-user-table-wrap">
              <table className="dd-admin-user-table dd-admin-theme-table">
                <thead>
                  <tr>
                    <th>提交时间</th>
                    <th>配色</th>
                    <th>设备</th>
                    <th>账号</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSubmissions.map((submission) => (
                    <tr key={submission.submissionId}>
                      <td>{formatDateTime(submission.createdAt)}</td>
                      <td>
                        <ThemeColorSwatches colors={submission.colors} />
                      </td>
                      <td>
                        <div className="dd-admin-user-cell">
                          <strong>{submission.deviceName || '未记录名称'}</strong>
                          <small>{submission.deviceId || '未记录设备 ID'}</small>
                        </div>
                      </td>
                      <td>{submission.accountId || '未关联账号'}</td>
                      <td>
                        <span className="dd-admin-status-dot is-green">Beta</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dd-admin-pagination">
              <span>{filteredSubmissions.length} 条 · 第 {safePageIndex + 1} / {totalPages} 页</span>
              <button type="button" disabled={safePageIndex === 0} onClick={() => setPageIndex((page) => Math.max(0, page - 1))}>上一页</button>
              <button type="button" disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex((page) => Math.min(totalPages - 1, page + 1))}>下一页</button>
            </div>
          </>
        )}
      </section>
    </section>
  )
}

function ThemeColorSwatches({ colors }: { colors: SnapLinkThemeColors }) {
  return (
    <div className="dd-admin-theme-swatches" aria-label="提交配色">
      <ThemeColorSwatch label="发送" color={colors.self} />
      <ThemeColorSwatch label="接收" color={colors.peer} />
      <ThemeColorSwatch label="AI" color={colors.ai} />
    </div>
  )
}

function ThemeColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <span className="dd-admin-theme-swatch-row">
      <i style={{ background: color }} aria-hidden="true" />
      <span>{label}</span>
      <code>{color}</code>
    </span>
  )
}
