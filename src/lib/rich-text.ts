import type { DocumentPreviewPayload } from './document-preview'
import type { FileConversationEntry } from '../app/types'
import { extractPlainTextFromRichText, sanitizeRichTextHtml } from '../app/utils'

export type BotMentionTriggerRange = {
  start: number
  end: number
}

export type SnapLinkQuoteDraftState = {
  senderName: string
  text: string
  html: string
}

const AI_BOT_MENTION_LABEL = '@DD助手'

export function escapeInlineHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function getRichTextPreviewText(value: string) {
  const text = extractPlainTextFromRichText(value)
  if (text) {
    return text
  }

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
    const image = documentFragment.body.querySelector('img[src]')
    if (image) {
      return image.getAttribute('alt')?.trim() || '图片'
    }
  }

  return ''
}

const clipboardBlockTags = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'ul'])

export function normalizeClipboardPlainText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
}

export function extractClipboardPlainTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'br') {
    return '\n'
  }

  if (tagName === 'img') {
    return element.getAttribute('alt')?.trim() || '图片'
  }

  if (tagName === 'pre') {
    return element.querySelector('code')?.textContent ?? element.textContent ?? ''
  }

  const childText = Array.from(element.childNodes)
    .map((child) => extractClipboardPlainTextFromNode(child))
    .join('')

  if (tagName === 'td' || tagName === 'th') {
    return `${childText}\t`
  }

  if (tagName === 'tr') {
    return `${childText.replace(/\t$/, '')}\n`
  }

  if (clipboardBlockTags.has(tagName)) {
    return `${childText}\n`
  }

  return childText
}

export function getRichTextClipboardText(value: string) {
  const fallbackText = normalizeClipboardPlainText(value)
  if (!/[<>]/.test(value) || typeof DOMParser === 'undefined') {
    return fallbackText
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return fallbackText
  }

  return normalizeClipboardPlainText(extractClipboardPlainTextFromNode(root))
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall back to a temporary textarea when clipboard permissions are unavailable.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.setAttribute('readonly', '')
  try {
    document.body.appendChild(textarea)
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

export async function copyRichTextToClipboard(value: string) {
  const sanitizedHtml = sanitizeRichTextHtml(value)
  const plainText = getRichTextClipboardText(value)

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined' && sanitizedHtml) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([sanitizedHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch {
      // Fall back to text-only clipboard behavior below.
    }
  }

  return copyTextToClipboard(plainText || sanitizedHtml || value)
}

export function renderQuoteDraftHtml(quoteDraft: SnapLinkQuoteDraftState) {
  return [
    '<blockquote class="dd-chatbox__quote">',
    `<strong>${escapeInlineHtml(quoteDraft.senderName)}：</strong>`,
    quoteDraft.html,
    '</blockquote>',
  ].join('')
}

export function createNativePdfPreviewUrl(payload: DocumentPreviewPayload) {
  if (typeof payload.source === 'string') {
    return payload.source
  }

  const blob = payload.source instanceof Blob
    ? payload.source
    : new Blob([payload.source], { type: payload.mimeType || 'application/pdf' })
  return URL.createObjectURL(blob)
}

export function normalizePlainComposerDraft(value: string) {
  if (!/[<>]/.test(value)) {
    return value.replace(/\r\n?/g, '\n')
  }

  return extractPlainTextFromRichText(value).replace(/\s*\n+\s*/g, ' ')
}

export function startsWithBotMention(value: string) {
  return /^@(?:DD助手|DD直连小助手|ai|bot)(?:$|[\s:：,，])/i.test(value.trimStart())
}

function createBotMentionDraft(value: string) {
  if (startsWithBotMention(value)) {
    return value
  }

  const normalizedDraft = value.trimStart()
  return normalizedDraft ? `${AI_BOT_MENTION_LABEL} ${normalizedDraft}` : `${AI_BOT_MENTION_LABEL} `
}

export function findBotMentionTriggerStart(value: string, caretPosition: number) {
  const beforeCaret = value.slice(0, caretPosition)
  if (!/(^|\s)@$/.test(beforeCaret)) {
    return null
  }

  return beforeCaret.length - 1
}

export function createBotMentionDraftFromTrigger(value: string, triggerRange: BotMentionTriggerRange | null) {
  if (!triggerRange || value.charAt(triggerRange.start) !== '@') {
    return createBotMentionDraft(value)
  }

  const triggerEnd = Math.max(triggerRange.end, triggerRange.start + 1)
  const valueWithoutTrigger = `${value.slice(0, triggerRange.start)}${value.slice(triggerEnd)}`
  return createBotMentionDraft(valueWithoutTrigger)
}

export function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()
  if (!extension || extension === fileName) {
    return 'FILE'
  }

  return extension.slice(0, 4).toUpperCase()
}

export function resolveMediaFileEntryKind(file: FileConversationEntry) {
  const normalizedMimeType = file.mimeType?.toLowerCase() ?? ''
  const normalizedFileName = file.fileName.toLowerCase()

  if (normalizedMimeType.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedFileName)) {
    return 'image' as const
  }

  if (normalizedMimeType.startsWith('video/') || /\.(m4v|mov|mp4|ogv|webm)$/i.test(normalizedFileName)) {
    return 'video' as const
  }

  return null
}

function getImageExtensionFromMimeType(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

export function isClipboardImageFile(file: File) {
  const normalizedMimeType = file.type.toLowerCase()
  const normalizedName = file.name.toLowerCase()

  return normalizedMimeType.startsWith('image/') || /\.(avif|bmp|gif|heic|jpe?g|png|svg|tiff?|webp)$/i.test(normalizedName)
}

function normalizePastedImageFile(file: File, index: number) {
  if (file.name.trim()) {
    return file
  }

  const extension = getImageExtensionFromMimeType(file.type || 'image/png')
  return new File([file], `snaplink-paste-${Date.now().toString()}-${(index + 1).toString()}.${extension}`, {
    type: file.type || 'image/png',
    lastModified: file.lastModified || Date.now(),
  })
}

function normalizePastedClipboardFile(file: File, index: number) {
  return isClipboardImageFile(file) ? normalizePastedImageFile(file, index) : file
}

export function getClipboardFiles(dataTransfer: DataTransfer) {
  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  const files = itemFiles.length > 0
    ? itemFiles
    : Array.from(dataTransfer.files)

  return files.map(normalizePastedClipboardFile)
}

export function isImageOnlyRichText(value: string) {
  if (!value || typeof DOMParser === 'undefined') {
    return false
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  let imageCount = 0

  if (!root) {
    return false
  }

  const containsOnlyImages = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      return !node.textContent?.trim()
    }

    if (!(node instanceof HTMLElement)) {
      return true
    }

    const tagName = node.tagName.toLowerCase()
    if (tagName === 'img') {
      imageCount += 1
      return true
    }

    if (tagName === 'br') {
      return true
    }

    return Array.from(node.childNodes).every(containsOnlyImages)
  }

  return Array.from(root.childNodes).every(containsOnlyImages) && imageCount > 0
}
