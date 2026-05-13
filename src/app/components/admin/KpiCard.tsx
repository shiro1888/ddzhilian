import type { KpiCard } from './constants'

export function KpiCardView({ card }: { card: KpiCard }) {
  return (
    <article className={`dd-admin-kpi-card is-${card.tone}`}>
      <div className="dd-admin-kpi-card__content">
        <span>{card.label}</span>
        <strong>{card.value}</strong>
        <small>{card.detail}</small>
      </div>
    </article>
  )
}

