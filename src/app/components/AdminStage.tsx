import { Tabs } from '@base-ui/react/tabs'
import { useState } from 'react'
import type {
  AdminAiSettings,
  AdminCloudflareConfig,
  AdminFeedbackProviderConfig,
  AdminHistoryStats,
  AdminOnlineDeviceNameUpdate,
  AdminOnlineDevicesSnapshot,
  AdminOpenRouterConfig,
  AdminRolesSnapshot,
  AdminSessionInfo,
  AdminThemeSubmissionsSnapshot,
  AdminUsageSnapshot,
  AdminUserQuotaUpdate,
  AdminUsersSnapshot,
} from '../../lib/ddzhilian-types'
import type {
  AdminOpenAiCompatibleDetectInput,
  AdminOpenAiCompatibleDetectResult,
  AdminOpenAiCompatibleRefreshResult,
  AdminToast,
} from '../../lib/use-admin'
import { AdminLogin } from './admin/AdminLogin'
import { AdminSidebar } from './admin/AdminSidebar'
import { AdminToastViewport } from './admin/Toast'
import { AdminTopbar } from './admin/AdminTopbar'
import { DashboardGrid } from './admin/DashboardGrid'
import { DashboardWidgetContent } from './admin/DashboardWidgets'
import { ModelsWorkspace } from './admin/ModelsWorkspace'
import { ProvidersWorkspace } from './admin/ProvidersWorkspace'
import { RoleManagementWorkspace } from './admin/RoleManagement'
import { OnlineDevicesWorkspace } from './admin/OnlineDevices'
import { ThemeSubmissionsWorkspace } from './admin/ThemeSubmissions'
import { UserManagementWorkspace } from './admin/UserManagement'
import {
  buildBusinessKpiCards,
  buildKpiCards,
  buildTrendSeries,
  isAdminSection,
  OPENAI_COMPATIBLE_PROVIDER_LABEL,
} from './admin/constants'
import type { AdminSection, DashboardWidgetKey } from './admin/constants'

type AdminStageProps = {
  adminEmailDraft: string
  adminPasswordDraft: string
  adminSession: AdminSessionInfo | null
  isAdminAuthenticated: boolean
  isAdminLoading: boolean
  isAdminLoginTransitioning: boolean
  isAdminSaving: boolean
  isAdminClearingHistory: boolean
  isAdminRenamingOnlineDevice: boolean
  isAdminUpdatingUser: boolean
  isAdminUpdatingRole: boolean
  isAdminDevLoginEnabled: boolean
  adminError: string | null
  adminToasts: AdminToast[]
  historyStats: AdminHistoryStats | null
  aiSettings: AdminAiSettings | null
  usage: AdminUsageSnapshot | null
  onlineDevices: AdminOnlineDevicesSnapshot | null
  users: AdminUsersSnapshot | null
  roles: AdminRolesSnapshot | null
  themeSubmissions: AdminThemeSubmissionsSnapshot | null
  onAdminEmailDraftChange: (value: string) => void
  onAdminPasswordDraftChange: (value: string) => void
  onAdminToastDismiss: (id: string) => void
  onConnect: () => void
  onDevConnect: () => void
  onDisconnect: () => void
  onProviderChange: (provider: AdminAiSettings['provider']) => void
  onSystemPromptChange: (value: string) => void
  onCloudflareFieldChange: <Field extends keyof AdminCloudflareConfig>(
    field: Field,
    value: AdminCloudflareConfig[Field],
  ) => void
  onOpenRouterFieldChange: <Field extends keyof AdminOpenRouterConfig>(
    field: Field,
    value: AdminOpenRouterConfig[Field],
  ) => void
  onFeedbackProviderAdd: (provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderChange: (providerId: string, provider: AdminFeedbackProviderConfig) => void
  onFeedbackProviderDelete: (providerId: string) => void
  onOpenRouterModelsDetect: (input: AdminOpenAiCompatibleDetectInput) => Promise<AdminOpenAiCompatibleDetectResult>
  onOpenRouterModelsRefresh: () => Promise<AdminOpenAiCompatibleRefreshResult>
  onSave: () => void
  onClearHistory: () => void
  onOnlineDeviceRename: (input: AdminOnlineDeviceNameUpdate) => Promise<void>
  onUserQuotaUpdate: (userId: string, quota: AdminUserQuotaUpdate) => Promise<void>
  onRoleCreate: (email: string) => Promise<void>
  onRoleDelete: (userId: string) => Promise<void>
}
type AdminThemeMode = 'system' | 'light' | 'dark'

export function AdminStage({
  adminEmailDraft,
  adminPasswordDraft,
  adminSession,
  isAdminAuthenticated,
  isAdminLoading,
  isAdminLoginTransitioning,
  isAdminSaving,
  isAdminClearingHistory,
  isAdminRenamingOnlineDevice,
  isAdminUpdatingUser,
  isAdminUpdatingRole,
  isAdminDevLoginEnabled,
  adminError,
  adminToasts,
  historyStats,
  aiSettings,
  usage,
  onlineDevices,
  users,
  roles,
  themeSubmissions,
  onAdminEmailDraftChange,
  onAdminPasswordDraftChange,
  onAdminToastDismiss,
  onConnect,
  onDevConnect,
  onDisconnect,
  onProviderChange,
  onSystemPromptChange,
  onCloudflareFieldChange,
  onOpenRouterFieldChange,
  onFeedbackProviderAdd,
  onFeedbackProviderChange,
  onFeedbackProviderDelete,
  onOpenRouterModelsDetect,
  onOpenRouterModelsRefresh,
  onSave,
  onClearHistory,
  onOnlineDeviceRename,
  onUserQuotaUpdate,
  onRoleCreate,
  onRoleDelete,
}: AdminStageProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isModuleCustomizerOpen, setIsModuleCustomizerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard')
  const [themeMode, setThemeMode] = useState<AdminThemeMode>('light')
  const currentSettings = aiSettings
  const allUsage = usage?.models ?? []
  const allTrendBuckets = usage?.trendBuckets ?? []
  const activeUsage = currentSettings
    ? allUsage.filter((item) => item.provider === currentSettings.provider)
    : []
  const activeTrendBuckets = currentSettings
    ? allTrendBuckets.filter((bucket) => bucket.provider === currentSettings.provider)
    : []
  const trendSeries = buildTrendSeries(activeTrendBuckets)
  const modelList = currentSettings
    ? currentSettings.provider === 'openrouter'
      ? currentSettings.openrouter.models
      : currentSettings.provider === 'cloudflare'
        ? currentSettings.cloudflare.models
        : currentSettings.feedbackProviders.find((provider) => provider.id === currentSettings.provider)?.openai?.models ??
          currentSettings.feedbackProviders.find((provider) => provider.id === currentSettings.provider)?.anthropic?.models ??
          []
    : []
  const defaultModel = currentSettings
    ? currentSettings.provider === 'openrouter'
      ? currentSettings.openrouter.model
      : currentSettings.provider === 'cloudflare'
        ? currentSettings.cloudflare.model
        : currentSettings.feedbackProviders.find((provider) => provider.id === currentSettings.provider)?.openai?.model ??
          currentSettings.feedbackProviders.find((provider) => provider.id === currentSettings.provider)?.anthropic?.model ??
          ''
    : ''
  const modelCatalogEntries = currentSettings
    ? [
        ...currentSettings.cloudflare.models.map((model) => ({
          ...model,
          apiProvider: 'cloudflare' as const,
          apiProviderLabel: 'Cloudflare AI',
        })),
        ...currentSettings.openrouter.models.map((model) => ({
          ...model,
          apiProvider: 'openrouter' as const,
          apiProviderLabel: currentSettings.openrouter.displayName || OPENAI_COMPATIBLE_PROVIDER_LABEL,
        })),
        ...currentSettings.feedbackProviders.flatMap((provider) => {
          const models = provider.openai?.models ?? provider.anthropic?.models ?? []
          return models.map((model) => ({
            ...model,
            apiProvider: provider.id,
            apiProviderLabel: provider.displayName || (provider.kind === 'anthropic' ? 'Anthropic feedback' : 'OpenAI feedback'),
          }))
        }),
      ]
    : []
  const catalogDefaultModels = currentSettings
    ? {
        cloudflare: currentSettings.cloudflare.model,
        openrouter: currentSettings.openrouter.model,
        ...Object.fromEntries(currentSettings.feedbackProviders.map((provider) => [
          provider.id,
          provider.openai?.model ?? provider.anthropic?.model ?? '',
        ])),
      }
    : {
        cloudflare: '',
        openrouter: '',
      }
  const kpis = buildKpiCards(historyStats, activeUsage, trendSeries)
  const businessKpis = buildBusinessKpiCards(historyStats, activeUsage)
  const isSuperAdmin = Boolean(adminSession?.isSuperAdmin)

  const updateModelEnabledForProvider = (
    provider: AdminAiSettings['provider'],
    id: string,
    enabled: boolean,
  ) => {
    if (!currentSettings) {
      return
    }

    if (provider === 'openrouter') {
      onOpenRouterFieldChange(
        'models',
        currentSettings.openrouter.models.map((model) => model.id === id ? { ...model, enabled } : model),
      )
      return
    }

    const feedbackProvider = currentSettings.feedbackProviders.find((entry) => entry.id === provider)
    if (feedbackProvider?.openai) {
      onFeedbackProviderChange(provider, {
        ...feedbackProvider,
        openai: {
          ...feedbackProvider.openai,
          models: feedbackProvider.openai.models.map((model) => model.id === id ? { ...model, enabled } : model),
        },
      })
      return
    }

    if (feedbackProvider?.anthropic) {
      onFeedbackProviderChange(provider, {
        ...feedbackProvider,
        anthropic: {
          ...feedbackProvider.anthropic,
          models: feedbackProvider.anthropic.models.map((model) => model.id === id ? { ...model, enabled } : model),
        },
      })
      return
    }

    onCloudflareFieldChange(
      'models',
      currentSettings.cloudflare.models.map((model) => model.id === id ? { ...model, enabled } : model),
    )
  }

  const updateDefaultModelForProvider = (provider: AdminAiSettings['provider'], id: string) => {
    if (!currentSettings) {
      return
    }

    if (provider === 'openrouter') {
      onOpenRouterFieldChange('model', id)
      return
    }

    const feedbackProvider = currentSettings.feedbackProviders.find((entry) => entry.id === provider)
    if (feedbackProvider?.openai) {
      onFeedbackProviderChange(provider, {
        ...feedbackProvider,
        openai: {
          ...feedbackProvider.openai,
          model: id,
        },
      })
      return
    }

    if (feedbackProvider?.anthropic) {
      onFeedbackProviderChange(provider, {
        ...feedbackProvider,
        anthropic: {
          ...feedbackProvider.anthropic,
          model: id,
        },
      })
      return
    }

    onCloudflareFieldChange('model', id)
  }

  const updateActiveModelEnabled = (id: string, enabled: boolean) => {
    if (currentSettings) {
      updateModelEnabledForProvider(currentSettings.provider, id, enabled)
    }
  }

  const updateActiveDefaultModel = (id: string) => {
    if (currentSettings) {
      updateDefaultModelForProvider(currentSettings.provider, id)
    }
  }

  const changeSection = (section: AdminSection) => {
    if (!isSuperAdmin && (section === 'providers' || section === 'roles')) {
      return
    }

    setActiveSection(section)
  }

  const toggleThemeMode = () => {
    setThemeMode((current) => current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system')
  }

  const renderDashboardWidget = (widgetKey: DashboardWidgetKey) => (
    <DashboardWidgetContent
      widgetKey={widgetKey}
      isLoading={isAdminLoading && !currentSettings}
      kpis={kpis}
      businessKpis={businessKpis}
      trendSeries={trendSeries}
      activeUsage={activeUsage}
      currentSettings={currentSettings}
      historyStats={historyStats}
      usage={usage}
      modelList={modelList}
      defaultModel={defaultModel}
      isAdminSaving={isAdminSaving}
      isAdminClearingHistory={isAdminClearingHistory}
      onClearHistory={onClearHistory}
      onCloudflareFieldChange={onCloudflareFieldChange}
      onOpenCatalog={() => setActiveSection('models')}
      onOpenProviders={() => setActiveSection('providers')}
      onOpenRouterFieldChange={onOpenRouterFieldChange}
      onFeedbackProviderAdd={onFeedbackProviderAdd}
      onFeedbackProviderChange={onFeedbackProviderChange}
      onFeedbackProviderDelete={onFeedbackProviderDelete}
      onOpenRouterModelsDetect={onOpenRouterModelsDetect}
      onOpenRouterModelsRefresh={onOpenRouterModelsRefresh}
      onProviderChange={onProviderChange}
      onSave={onSave}
      onSetDefaultModel={updateActiveDefaultModel}
      onSystemPromptChange={onSystemPromptChange}
      onToggleModel={updateActiveModelEnabled}
    />
  )

  return (
    <section className="dd-admin-workbench">
      <AdminToastViewport toasts={adminToasts} onDismiss={onAdminToastDismiss} />
      {!isAdminAuthenticated ? (
        <AdminLogin
          adminEmailDraft={adminEmailDraft}
          adminPasswordDraft={adminPasswordDraft}
          adminError={adminError}
          isAdminLoading={isAdminLoading}
          isAdminLoginTransitioning={isAdminLoginTransitioning}
          isAdminDevLoginEnabled={isAdminDevLoginEnabled}
          onAdminEmailDraftChange={onAdminEmailDraftChange}
          onAdminPasswordDraftChange={onAdminPasswordDraftChange}
          onConnect={onConnect}
          onDevConnect={onDevConnect}
        />
      ) : (
        <Tabs.Root
          className={'dd-admin-dashboard-layout' + (isSidebarCollapsed ? ' is-sidebar-collapsed' : '')}
          data-admin-theme={themeMode}
          orientation="vertical"
          value={activeSection}
          onValueChange={(value) => {
            if (isAdminSection(value)) {
              changeSection(value)
            }
          }}
        >
          <AdminSidebar
            activeSection={activeSection}
            isSidebarCollapsed={isSidebarCollapsed}
            isSuperAdmin={isSuperAdmin}
            themeMode={themeMode}
            onDisconnect={onDisconnect}
            onSectionChange={changeSection}
            onThemeToggle={toggleThemeMode}
            onToggleCollapsed={() => setIsSidebarCollapsed((previous) => !previous)}
          />

          <div className="dd-admin-content">
            <AdminTopbar
              activeSection={activeSection}
              adminSession={adminSession}
              isModuleCustomizerOpen={isModuleCustomizerOpen}
              onToggleModuleCustomizer={() => setIsModuleCustomizerOpen((previous) => !previous)}
            />

            {adminError ? (
              <section className="dd-admin-banner">
                <p className="dd-error-note">{adminError}</p>
              </section>
            ) : null}

            <Tabs.Panel className="dd-admin-section-panel" value="dashboard" keepMounted>
              <div className="dd-admin-section-panel__inner">
                <DashboardGrid isEditing={isModuleCustomizerOpen} renderWidget={renderDashboardWidget} />
              </div>
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="models" keepMounted>
              <ModelsWorkspace
                onBackToDashboard={() => setActiveSection('dashboard')}
                catalogModels={modelCatalogEntries}
                catalogDefaultModels={catalogDefaultModels}
                onCatalogToggle={updateModelEnabledForProvider}
                onCatalogSetDefault={updateDefaultModelForProvider}
                onSave={onSave}
                isSaving={isAdminSaving}
              />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="providers" keepMounted>
              {isSuperAdmin && currentSettings ? (
                <ProvidersWorkspace
                  settings={currentSettings}
                  activeProvider={currentSettings.provider}
                  usage={activeUsage}
                  onSystemPromptChange={onSystemPromptChange}
                  onCloudflareFieldChange={onCloudflareFieldChange}
                  onOpenRouterFieldChange={onOpenRouterFieldChange}
                  onFeedbackProviderAdd={onFeedbackProviderAdd}
                  onFeedbackProviderChange={onFeedbackProviderChange}
                  onFeedbackProviderDelete={onFeedbackProviderDelete}
                  onOpenRouterModelsDetect={onOpenRouterModelsDetect}
                  onOpenRouterModelsRefresh={onOpenRouterModelsRefresh}
                  onProviderChange={onProviderChange}
                  onSave={onSave}
                  isSaving={isAdminSaving}
                />
              ) : (
                <p className="dd-admin-user-message">当前账号没有 API 密钥管理权限。</p>
              )}
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="online" keepMounted>
              <OnlineDevicesWorkspace
                onlineDevices={onlineDevices}
                isRenamingDevice={isAdminRenamingOnlineDevice}
                onDeviceRename={onOnlineDeviceRename}
              />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="users" keepMounted>
              <UserManagementWorkspace
                users={users}
                isUpdatingUser={isAdminUpdatingUser}
                onUserQuotaUpdate={onUserQuotaUpdate}
              />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="themes" keepMounted>
              <ThemeSubmissionsWorkspace themeSubmissions={themeSubmissions} />
            </Tabs.Panel>

            <Tabs.Panel className="dd-admin-section-panel" value="roles" keepMounted>
              <RoleManagementWorkspace
                roles={roles}
                isSuperAdmin={isSuperAdmin}
                isUpdatingRole={isAdminUpdatingRole}
                onRoleCreate={onRoleCreate}
                onRoleDelete={onRoleDelete}
              />
            </Tabs.Panel>
          </div>
        </Tabs.Root>
      )}
    </section>
  )
}
