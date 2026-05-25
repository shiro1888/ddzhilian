'use client'

import { useMemo, useState } from 'react'
import type { AdminAiSettings, AdminModelToggleItem } from '@/lib/ddzhilian-types'
import {
  buildAdminAiModelGroups,
  setAdminProviderDefaultModel,
  toggleAdminProviderModel,
  type AdminAiModelGroup,
} from '@/admin-v2/ai-draft'
import { adminSelectClassName, formatInteger } from '@/admin-v2/format'
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

type AdminV2ModelsWorkspaceProps = {
  aiDraft: AdminAiSettings
  activeProvider: AdminAiSettings['provider']
  canEdit: boolean
  hasChanges: boolean
  isSaving: boolean
  onReset: () => void
  onSave: () => void
  onChange: (updater: (current: AdminAiSettings) => AdminAiSettings) => void
}

function summarizeEnabledModels(models: AdminModelToggleItem[]) {
  return models.filter((model) => model.enabled).length
}

function ModelGroupCard({
  group,
  isCurrentProvider,
  canEdit,
  onToggle,
  onSetDefault,
}: Readonly<{
  group: AdminAiModelGroup
  isCurrentProvider: boolean
  canEdit: boolean
  onToggle: (group: AdminAiModelGroup, modelId: string, enabled: boolean) => void
  onSetDefault: (group: AdminAiModelGroup, modelId: string) => void
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {group.providerLabel}
              {isCurrentProvider ? <Badge variant="secondary">当前接管</Badge> : null}
            </CardTitle>
            <CardDescription>
              {group.providerTypeLabel} · 默认模型 {group.defaultModel || '未设置'}
            </CardDescription>
          </div>
          <Badge variant="outline">
            已启用 {formatInteger(summarizeEnabledModels(group.models))} / {formatInteger(group.models.length)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              <TableHead>模型 ID</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>默认</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.models.map((model) => {
              const isDefault = group.defaultModel === model.id
              return (
                <TableRow key={`${group.providerId}:${model.id}`}>
                  <TableCell className="font-medium">{model.label}</TableCell>
                  <TableCell className="max-w-[22rem] truncate text-muted-foreground">{model.id}</TableCell>
                  <TableCell>
                    <Badge variant={model.enabled ? 'secondary' : 'outline'}>
                      {model.enabled ? '启用' : '关闭'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isDefault ? <Badge>默认</Badge> : <span className="text-muted-foreground">未设为默认</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={model.enabled ? 'outline' : 'secondary'}
                        disabled={!canEdit}
                        onClick={() => onToggle(group, model.id, !model.enabled)}
                      >
                        {model.enabled ? '停用' : '启用'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={isDefault ? 'secondary' : 'outline'}
                        disabled={!canEdit || isDefault}
                        onClick={() => onSetDefault(group, model.id)}
                      >
                        {isDefault ? '已是默认' : '设为默认'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function AdminV2ModelsWorkspace({
  aiDraft,
  activeProvider,
  canEdit,
  hasChanges,
  isSaving,
  onReset,
  onSave,
  onChange,
}: AdminV2ModelsWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [providerFilter, setProviderFilter] = useState<'all' | string>('all')
  const groups = useMemo(() => buildAdminAiModelGroups(aiDraft), [aiDraft])
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const visibleGroups = groups
    .filter((group) => providerFilter === 'all' || group.providerId === providerFilter)
    .map((group) => ({
      ...group,
      models: normalizedSearchQuery
        ? group.models.filter((model) =>
            `${model.label} ${model.id}`.toLowerCase().includes(normalizedSearchQuery),
          )
        : group.models,
    }))
    .filter((group) => group.models.length > 0)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>模型目录</CardTitle>
              <CardDescription>
                当前页面直接编辑本地 `AdminAiSettings` 草稿，保存时统一提交到 `/api/admin/ai-config`。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!hasChanges || isSaving} onClick={onReset}>
                重置草稿
              </Button>
              <Button type="button" disabled={!canEdit || !hasChanges || isSaving} onClick={onSave}>
                {isSaving ? '保存中...' : '保存模型配置'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <Input
            type="search"
            value={searchQuery}
            placeholder="按模型名或模型 ID 搜索"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className={adminSelectClassName}
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
          >
            <option value="all">全部供应商</option>
            {groups.map((group) => (
              <option key={group.providerId} value={group.providerId}>
                {group.providerLabel}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">当前接管 {activeProvider}</Badge>
            {!canEdit ? <Badge variant="secondary">只读</Badge> : null}
          </div>
        </CardContent>
      </Card>

      {visibleGroups.map((group) => (
        <ModelGroupCard
          key={group.providerId}
          group={group}
          isCurrentProvider={activeProvider === group.providerId}
          canEdit={canEdit}
          onToggle={(currentGroup, modelId, enabled) => {
            onChange((current) => toggleAdminProviderModel(current, currentGroup.providerId, modelId, enabled))
          }}
          onSetDefault={(currentGroup, modelId) => {
            onChange((current) => setAdminProviderDefaultModel(current, currentGroup.providerId, modelId))
          }}
        />
      ))}

      {visibleGroups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            当前筛选条件下没有模型。
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
