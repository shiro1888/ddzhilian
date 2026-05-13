import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import type { AdminRolesSnapshot, AdminRoleSummary } from '../../../lib/ddzhilian-types'
import { formatDateTime, formatInteger } from './constants'

export function RoleManagementWorkspace({
  roles,
  isSuperAdmin,
  isUpdatingRole,
  onRoleCreate,
  onRoleDelete,
}: {
  roles: AdminRolesSnapshot | null
  isSuperAdmin: boolean
  isUpdatingRole: boolean
  onRoleCreate: (email: string) => Promise<void>
  onRoleDelete: (userId: string) => Promise<void>
}) {
  const [emailDraft, setEmailDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const roleItems = roles?.roles ?? []
  const superAdminCount = roleItems.filter((role) => role.role === 'super_admin').length
  const adminCount = roleItems.filter((role) => role.role === 'admin').length
  const canSubmit = isSuperAdmin && emailDraft.trim().length > 0 && !isUpdatingRole

  const submitRole = () => {
    const email = emailDraft.trim()
    if (!email) {
      setMessage('请输入管理员邮箱。')
      return
    }

    void onRoleCreate(email)
      .then(() => {
        setEmailDraft('')
        setMessage('已添加')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '添加失败')
      })
  }

  return (
    <section className="dd-admin-page-stack">
      <section className="dd-admin-table-card dd-admin-user-management-card">
        <div className="dd-admin-card__head">
          <div>
            <p>角色管理</p>
            <h3>Admin Roles</h3>
            <span>
              {roles?.configured
                ? `已加载 ${formatInteger(roleItems.length)} 个后台账号`
                : 'Supabase 未配置时不会读取管理员角色'}
            </span>
          </div>
          <div className="dd-admin-user-summary">
            <span>
              <strong>{formatInteger(superAdminCount)}</strong>
              超级管理员
            </span>
            <span>
              <strong>{formatInteger(adminCount)}</strong>
              管理员
            </span>
          </div>
        </div>

        <div className="dd-admin-role-create">
          <Input
            type="email"
            placeholder="管理员邮箱"
            value={emailDraft}
            disabled={!isSuperAdmin || isUpdatingRole}
            onChange={(event) => {
              setEmailDraft(event.target.value)
              setMessage(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitRole()
              }
            }}
          />
          <Button
            type="button"
            className="dd-button dd-button--primary"
            disabled={!canSubmit}
            onClick={submitRole}
          >
            {isUpdatingRole ? '保存中' : '添加管理员'}
          </Button>
          {message ? <small className={message === '已添加' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>

        {!isSuperAdmin ? (
          <p className="dd-admin-user-message">当前账号没有角色管理权限。</p>
        ) : !roles ? (
          <p className="dd-admin-user-message">正在等待后台角色快照。</p>
        ) : !roles.configured ? (
          <p className="dd-admin-user-message">当前后端未配置 Supabase，管理员角色暂不可用。</p>
        ) : roles.error ? (
          <p className="dd-admin-user-message is-error">{roles.error}</p>
        ) : roleItems.length === 0 ? (
          <p className="dd-admin-user-message">暂无管理员角色记录。</p>
        ) : (
          <div className="dd-admin-user-table-wrap">
            <table className="dd-admin-user-table dd-admin-role-table">
              <thead>
                <tr>
                  <th>管理员</th>
                  <th>角色</th>
                  <th>来源</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {roleItems.map((role) => (
                  <AdminRoleRow
                    key={`${role.role}:${role.userId || role.email}`}
                    role={role}
                    isSaving={isUpdatingRole}
                    onRoleDelete={onRoleDelete}
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

function AdminRoleRow({
  role,
  isSaving,
  onRoleDelete,
}: {
  role: AdminRoleSummary
  isSaving: boolean
  onRoleDelete: (userId: string) => Promise<void>
}) {
  const [message, setMessage] = useState<string | null>(null)
  const canDelete = role.role === 'admin' && role.source === 'database' && Boolean(role.userId)

  const deleteRole = () => {
    if (!canDelete) {
      return
    }

    void onRoleDelete(role.userId)
      .then(() => {
        setMessage('已删除')
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '删除失败')
      })
  }

  return (
    <tr>
      <td>
        <div className="dd-admin-user-cell">
          <strong>{role.email || '未记录邮箱'}</strong>
          <small>{role.userId || '账号未注册'}</small>
        </div>
      </td>
      <td>{role.role === 'super_admin' ? '超级管理员' : '管理员'}</td>
      <td>{role.source === 'env' ? '环境变量' : '数据库'}</td>
      <td>{formatDateTime(role.createdAt)}</td>
      <td>{formatDateTime(role.updatedAt)}</td>
      <td>
        <div className="dd-admin-user-row-actions">
          <Button
            type="button"
            className="dd-button dd-button--danger dd-admin-user-save"
            disabled={isSaving || !canDelete}
            onClick={deleteRole}
          >
            {isSaving ? '删除中' : '删除'}
          </Button>
          {message ? <small className={message === '已删除' ? 'is-success' : 'is-error'}>{message}</small> : null}
        </div>
      </td>
    </tr>
  )
}

