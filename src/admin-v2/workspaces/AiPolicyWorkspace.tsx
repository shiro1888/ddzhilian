'use client'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

type AiPolicyWorkspaceProps = {
  systemPromptDraft: string
  savedSystemPrompt: string
  canEdit: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
  onClearError: () => void
  onDraftChange: (value: string) => void
  onAutosave: () => void
}

export function AdminV2AiPolicyWorkspace({
  systemPromptDraft,
  savedSystemPrompt,
  canEdit,
  isSaving,
  hasUnsavedChanges,
  error,
  onClearError,
  onDraftChange,
  onAutosave,
}: AiPolicyWorkspaceProps) {
  const status = error
    ? { label: error, variant: 'destructive' as const }
    : isSaving
      ? { label: '自动保存中', variant: 'outline' as const }
      : hasUnsavedChanges
        ? { label: '存在未保存更改', variant: 'outline' as const }
        : { label: '已保存', variant: 'secondary' as const }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                输入你的System Prompt
              </CardDescription>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <Textarea
              aria-label="System Prompt"
              className="min-h-56"
              value={systemPromptDraft}
              disabled={!canEdit}
              onChange={(event) => {
                onClearError()
                onDraftChange(event.target.value)
              }}
              onBlur={() => {
                if (systemPromptDraft !== savedSystemPrompt) {
                  onAutosave()
                }
              }}
            />
            <span className="text-xs text-muted-foreground">
              自动保存规则：离开输入框后，如果内容有变化且通过基础校验，就会提交完整
            </span>
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
