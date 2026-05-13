import type { AdminAiSettings } from '../../../lib/ddzhilian-types'
import { describeProviderStatus, OPENAI_COMPATIBLE_PROVIDER_LABEL } from './constants'

export function ProviderTable({
  settings,
  activeProvider,
  action,
}: {
  settings: AdminAiSettings
  activeProvider: AdminAiSettings['provider']
  action?: {
    label: string
    onClick: () => void
  }
}) {
  const providers = describeProviderStatus(settings)

  return (
    <section className="dd-admin-table-card">
      <div className="dd-admin-card__head">
        <div>
          <p>模型供应商</p>
          <h3>Provider Health</h3>
        </div>
        {action ? (
          <button type="button" className="dd-admin-link-button" onClick={action.onClick}>{action.label}</button>
        ) : null}
      </div>
      <table className="dd-admin-provider-table">
        <thead>
          <tr>
            <th>供应商</th>
            <th>状态</th>
            <th>可用模型</th>
            <th>当前接管</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.name}>
              <td>{provider.name}</td>
              <td><span className={`dd-admin-status-dot ${provider.state === '健康' ? 'is-green' : 'is-amber'}`}>{provider.state}</span></td>
              <td>{provider.modelCount}</td>
              <td>{provider.enabled ? (activeProvider === 'openrouter' ? OPENAI_COMPATIBLE_PROVIDER_LABEL : 'Cloudflare') : '待切换'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

