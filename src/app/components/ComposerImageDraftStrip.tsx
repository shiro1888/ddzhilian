import { X } from 'lucide-react'
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
        <figure key={image.id} className="dd-snaplink__image-draft" title={image.name}>
          <img src={image.dataUrl} alt={image.name} />
          <button
            type="button"
            aria-label={`移除 ${image.name}`}
            title="移除此图片"
            onClick={() => onRemove(image.id)}
          >
            <X size={12} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </figure>
      ))}
    </div>
  )
}
