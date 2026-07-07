import type { CSSProperties, MouseEventHandler, PointerEventHandler } from 'react'

const recallParticleColumnCount = 18
const recallParticleRowCount = 10
const recallParticleIndexes = Array.from(
  { length: recallParticleColumnCount * recallParticleRowCount },
  (_, index) => index,
)

function getRecallParticleStyle(index: number): CSSProperties {
  const column = index % recallParticleColumnCount
  const row = Math.floor(index / recallParticleColumnCount)
  const columnProgress = column / Math.max(1, recallParticleColumnCount - 1)
  const rowProgress = row / Math.max(1, recallParticleRowCount - 1)
  const seedA = ((index * 37) % 101) / 100
  const seedB = ((index * 53 + 17) % 97) / 96
  const seedC = ((index * 29 + 41) % 89) / 88
  const left = Math.min(95, Math.max(5, 4.5 + columnProgress * 91 + (seedA - 0.5) * 3.2))
  const top = Math.min(92, Math.max(8, 8 + rowProgress * 84 + (seedB - 0.5) * 4.8))
  const dx = 24 + columnProgress * 88 + seedA * 30
  const dy = (rowProgress - 0.5) * 52 + (seedB - 0.5) * 22
  const size = 1.8 + seedC * 3.6
  const delay = columnProgress * 72 + seedB * 38

  return {
    '--recall-particle-left': `${left.toFixed(2)}%`,
    '--recall-particle-top': `${top.toFixed(2)}%`,
    '--recall-particle-dx': `${dx.toFixed(2)}px`,
    '--recall-particle-dy': `${dy.toFixed(2)}px`,
    '--recall-particle-size': `${size.toFixed(2)}px`,
    '--recall-particle-delay': `${delay.toFixed(2)}ms`,
  } as CSSProperties
}

type MessageBubbleProps = {
  entryId: string
  html: string
  isImageOnly: boolean
  isRecalling: boolean
  recallPhase?: 'animating'
  onClick: MouseEventHandler<HTMLDivElement>
  onContextMenu: MouseEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
}

function hasOnlyCodeBlock(html: string) {
  const normalized = html.trim()
  return /^(?:\s*)?<pre\b[^>]*\bclass=(?:"|')([^"']*\bdd-code-block\b[^"']*)(?:"|')[^>]*>[\s\S]*<\/pre>(?:\s*)?$/i.test(
    normalized,
  )
}

export function MessageBubble({
  entryId,
  html,
  isImageOnly,
  isRecalling,
  recallPhase,
  onClick,
  onContextMenu,
  onPointerMove,
  onPointerLeave,
  onPointerCancel,
}: MessageBubbleProps) {
  const hasCodeBlock = html.includes('dd-code-block')
  const isOnlyCodeBlock = hasOnlyCodeBlock(html)

  return (
    <div
      className={[
        'dd-snaplink__bubble-shell',
        isRecalling ? 'is-recalling' : '',
        isImageOnly ? 'is-image-comet' : '',
      ].filter(Boolean).join(' ')}
      data-recall-phase={isRecalling ? 'animating' : recallPhase}
      onPointerMove={isImageOnly ? onPointerMove : undefined}
      onPointerLeave={isImageOnly ? onPointerLeave : undefined}
      onPointerCancel={isImageOnly ? onPointerCancel : undefined}
    >
      <div
        className={[
          'dd-snaplink__bubble',
          'dd-chatbox__bubble--rich',
          hasCodeBlock ? 'has-code-block' : '',
          isOnlyCodeBlock ? 'is-code-only' : '',
          isImageOnly ? 'is-image-only' : '',
        ].filter(Boolean).join(' ')}
        onClick={onClick}
        onContextMenu={onContextMenu}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isRecalling ? (
        <span className="dd-snaplink__recall-particles" aria-hidden="true">
          {recallParticleIndexes.map((particleIndex) => (
            <span
              key={`${entryId}-recall-particle-${particleIndex.toString()}`}
              style={getRecallParticleStyle(particleIndex)}
            />
          ))}
        </span>
      ) : null}
    </div>
  )
}
