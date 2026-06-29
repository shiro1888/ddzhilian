import type { ComposerImageDraft } from '../types'

type ComposerImageDraftStripProps = {
  images: ComposerImageDraft[]
  onRemove: (id: string) => void
}

export function ComposerImageDraftStrip({ images, onRemove }: ComposerImageDraftStripProps) {
  if (images.length === 0) {
    return null
  }

  return (
    <div className="dd-snaplink__image-drafts" aria-label="待发送图片">
      {images.map((image) => (
        <figure key={image.id} className="dd-snaplink__image-draft">
          <img src={image.dataUrl} alt={image.name} />
          <button
            type="button"
            aria-label={`移除 ${image.name}`}
            onClick={() => onRemove(image.id)}
          >
            ×
          </button>
        </figure>
      ))}
    </div>
  )
}
