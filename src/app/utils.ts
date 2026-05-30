import type { FileConversationEntry, PeerConnectionStatus } from './types'

export function transferStatusLabel(
  status:
    | 'queued'
    | 'waiting_for_target'
    | 'connecting'
    | 'ready'
    | 'transferring'
    | 'completed'
    | 'failed'
    | 'cancelled',
) {
  switch (status) {
    case 'queued':
      return '等待开始'
    case 'waiting_for_target':
      return '等待已连接设备'
    case 'connecting':
      return '正在建立连接'
    case 'ready':
      return '准备发送'
    case 'transferring':
      return '正在发送'
    case 'completed':
      return '发送成功'
    case 'failed':
      return '发送失败'
    case 'cancelled':
      return '已取消'
  }
}

export function transferStatusTone(
  status:
    | 'queued'
    | 'waiting_for_target'
    | 'connecting'
    | 'ready'
    | 'transferring'
    | 'completed'
    | 'failed'
    | 'cancelled',
): FileConversationEntry['tone'] {
  switch (status) {
    case 'failed':
      return 'failed'
    case 'completed':
      return 'completed'
    case 'transferring':
      return 'active'
    default:
      return 'pending'
  }
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${bytes} B`
}

export function formatRelativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(0, Math.floor(delta / 60_000))

  if (minutes <= 0) {
    return '刚刚'
  }

  if (minutes < 60) {
    return `${minutes} 分钟前`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }

  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function formatChatDivider(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function shouldInsertDivider(previousIso: string | null, currentIso: string) {
  if (!previousIso) {
    return true
  }

  const previousTime = new Date(previousIso).getTime()
  const currentTime = new Date(currentIso).getTime()
  return currentTime - previousTime > 15 * 60 * 1000
}

export function collapseBroadcastTextRecords<T extends {
  id: string
  fromSelf: boolean
  senderName?: string
  text: string
  createdAt: string
}>(
  records: T[],
) {
  const collapsed: T[] = []

  for (const record of records) {
    const previous = collapsed[collapsed.length - 1]
    const sameSender =
      previous &&
      previous.fromSelf === record.fromSelf &&
      (previous.fromSelf ||
        (previous.senderName &&
          record.senderName &&
          previous.senderName === record.senderName))
    const isDuplicateBroadcast =
      previous &&
      previous.text === record.text &&
      Math.abs(new Date(record.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5_000 &&
      (previous.id === record.id || sameSender)

    if (!isDuplicateBroadcast) {
      collapsed.push(record)
    }
  }

  return collapsed
}

export function deviceConnectionLabel(status?: PeerConnectionStatus) {
  switch (status) {
    case 'connecting':
      return '连接中'
    case 'connected':
      return '已连接'
    case 'failed':
      return '连接失败'
    case 'closed':
      return '在线'
    default:
      return '在线'
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderInlineImageHtml(src: string, alt = '') {
  return `<img src="${escapeHtml(src)}"${alt ? ` alt="${escapeHtml(alt)}"` : ''} />`
}

export function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('图片读取失败。'))
    })
    reader.addEventListener('error', () => reject(new Error('图片读取失败。')))
    reader.readAsDataURL(file)
  })
}

export async function renderImageFilesAsInlineHtml(files: File[]) {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  const sources = await Promise.all(imageFiles.map((file) => readImageFileAsDataUrl(file)))
  return sources
    .map((src, index) => renderInlineImageHtml(src, imageFiles[index]?.name ?? '图片'))
    .join('')
}

function isSafeUrl(value: string, kind: 'href' | 'src') {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return false
  }

  if (kind === 'src' && normalizedValue.startsWith('data:image/')) {
    return true
  }

  return /^(https?:|mailto:|tel:)/i.test(normalizedValue)
}

function normalizeAutolinkHref(value: string) {
  const href = value.startsWith('www.') ? `https://${value}` : value

  try {
    const url = new URL(href)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    return null
  }

  return null
}

function isAppleMusicUrl(value: string) {
  try {
    const url = new URL(value)
    const normalizedHost = url.hostname.replace(/^www\./i, '').toLowerCase()
    if (normalizedHost !== 'music.apple.com' && normalizedHost !== 'embed.music.apple.com') {
      return false
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      return false
    }

    const pageKind = segments[1]?.toLowerCase()
    return ['album', 'playlist', 'song', 'station', 'music-video'].includes(pageKind)
  } catch {
    return false
  }
}

function appleMusicTitleFromUrl(value: string) {
  try {
    const url = new URL(value)
    const segments = url.pathname.split('/').filter(Boolean)
    const rawTitle = segments[2]
    if (!rawTitle) {
      return 'Apple Music'
    }

    return decodeURIComponent(rawTitle)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  } catch {
    return 'Apple Music'
  }
}

function renderAppleMusicCard(href: string, lyricText = '') {
  if (!isAppleMusicUrl(href)) {
    return ''
  }

  const title = appleMusicTitleFromUrl(href)
  const lyricLines = lyricText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return [
    `<div class="dd-music-card dd-music-card--apple${lyricLines.length > 0 ? ' dd-music-card--lyrics' : ''}">`,
    '<div class="dd-music-card__summary">',
    '<div class="dd-music-card__art" aria-hidden="true">♪</div>',
    '<div class="dd-music-card__body">',
    '<span class="dd-music-card__service">Apple Music</span>',
    `<strong class="dd-music-card__title">${escapeHtml(title)}</strong>`,
    `<span class="dd-music-card__meta">${lyricLines.length > 0 ? '歌词分享' : '音乐链接'}</span>`,
    '</div>',
    `<a class="dd-music-card__link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">打开</a>`,
    '</div>',
    lyricLines.length > 0
      ? `<blockquote class="dd-music-card__lyrics">${lyricLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</blockquote>`
      : '',
    '</div>',
  ].join('')
}

function splitAutolinkMatch(value: string) {
  const trailingMatch = value.match(/[.,!?;:，。！？；：]+$/)
  const trailingText = trailingMatch?.[0] ?? ''
  const linkText = trailingText ? value.slice(0, -trailingText.length) : value
  return {
    trailingText,
    linkText,
    href: normalizeAutolinkHref(linkText),
  }
}

export function renderAppleMusicLyricShare(value: string) {
  const normalizedValue = extractAppleMusicShareText(value)
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi
  const match = Array.from(normalizedValue.matchAll(urlPattern))
    .map((entry) => {
      const rawMatch = entry[0]
      const link = splitAutolinkMatch(rawMatch)
      return {
        index: entry.index ?? 0,
        rawMatch,
        ...link,
      }
    })
    .find((entry) => entry.href && isAppleMusicUrl(entry.href))

  if (!match?.href) {
    return ''
  }

  const textWithoutLink = [
    normalizedValue.slice(0, match.index),
    normalizedValue.slice(match.index + match.rawMatch.length),
  ].join('\n')
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!textWithoutLink || !/\r?\n/.test(textWithoutLink)) {
    return ''
  }

  return renderAppleMusicCard(match.href, textWithoutLink)
}

function extractAppleMusicShareText(value: string) {
  if (!/[<>]/.test(value) || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  return root ? extractTextWithLineBreaks(root) : value
}

export function linkifyPlainTextUrls(value: string) {
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi
  let html = ''
  let lastIndex = 0

  for (const match of value.matchAll(urlPattern)) {
    const matchIndex = match.index ?? 0
    const rawMatch = match[0]
    const { trailingText, linkText, href } = splitAutolinkMatch(rawMatch)

    if (!href) {
      continue
    }

    html += escapeHtml(value.slice(lastIndex, matchIndex))
    html += renderAppleMusicCard(href) ||
      `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(linkText)}</a>`
    html += escapeHtml(trailingText)
    lastIndex = matchIndex + rawMatch.length
  }

  html += escapeHtml(value.slice(lastIndex))
  return html
}

function hasMarkdownFence(value: string) {
  return /^ {0,3}(```|~~~)[\w#+.-]*\s*$/m.test(value)
}

function hasMarkdownSyntax(value: string) {
  return (
    hasMarkdownFence(value) ||
    /^ {0,3}(#{1,3}\s+\S|>\s?\S|(?:[-*+]\s+|\d+[.)]\s+)\S)/m.test(value) ||
    /(?:^|[\s([{])(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`)/.test(value) ||
    /!?\[[^\]\n]+\]\((?:https?:\/\/|mailto:|tel:)[^)]+\)/i.test(value)
  )
}

function createMarkdownPlaceholder(store: string[], html: string) {
  const index = store.push(html) - 1
  return `\uE000${index.toString()}\uE001`
}

function restoreMarkdownPlaceholders(value: string, store: string[]) {
  return value.replace(/\uE000(\d+)\uE001/g, (_, rawIndex: string) => store[Number(rawIndex)] ?? '')
}

function renderMarkdownInline(value: string) {
  const placeholders: string[] = []
  let text = value.replace(/`([^`\n]+)`/g, (_, codeText: string) =>
    createMarkdownPlaceholder(placeholders, `<code>${escapeHtml(codeText)}</code>`),
  )

  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (match: string, alt: string, src: string) => {
    if (!isSafeUrl(src, 'src')) {
      return match
    }

    return createMarkdownPlaceholder(
      placeholders,
      `<img src="${escapeHtml(src)}"${alt ? ` alt="${escapeHtml(alt)}"` : ''} />`,
    )
  })

  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match: string, label: string, href: string) => {
    if (!isSafeUrl(href, 'href')) {
      return match
    }

    return createMarkdownPlaceholder(
      placeholders,
      `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
    )
  })

  const replaceInlineStyle = (pattern: RegExp, tagName: 'strong' | 'em' | 's') => {
    text = text.replace(pattern, (match: string, content: string) => {
      const normalizedContent = content.trim()
      if (!normalizedContent) {
        return match
      }

      return createMarkdownPlaceholder(placeholders, `<${tagName}>${escapeHtml(normalizedContent)}</${tagName}>`)
    })
  }

  replaceInlineStyle(/\*\*([^*\n]+)\*\*/g, 'strong')
  replaceInlineStyle(/__([^_\n]+)__/g, 'strong')
  replaceInlineStyle(/~~([^~\n]+)~~/g, 's')
  replaceInlineStyle(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, 'em')
  replaceInlineStyle(/(?<!_)_([^_\n]+)_(?!_)/g, 'em')

  return restoreMarkdownPlaceholders(linkifyPlainTextUrls(text), placeholders)
}

function renderMarkdownFenceHtml(codeText: string, language: string) {
  return renderCodeBlockHtml(codeText, language)
}

function renderMarkdownBlocks(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let index = 0

  const isBlockStart = (line: string) =>
    /^ {0,3}(```|~~~)[\w#+.-]*\s*$/.test(line) ||
    /^ {0,3}#{1,3}\s+\S/.test(line) ||
    /^ {0,3}>\s?/.test(line) ||
    /^ {0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line)

  while (index < lines.length) {
    const currentLine = lines[index] ?? ''

    if (!currentLine.trim()) {
      index += 1
      continue
    }

    const fenceMatch = currentLine.match(/^ {0,3}(```|~~~)([\w#+.-]*)\s*$/)
    if (fenceMatch) {
      const [, marker, language = ''] = fenceMatch
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !(lines[index] ?? '').startsWith(marker)) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      blocks.push(renderMarkdownFenceHtml(codeLines.join('\n').trimEnd(), language))
      continue
    }

    const headingMatch = currentLine.match(/^ {0,3}(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push(`<h${level}>${renderMarkdownInline(headingMatch[2].trim())}</h${level}>`)
      index += 1
      continue
    }

    if (/^ {0,3}>\s?/.test(currentLine)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^ {0,3}>\s?/.test(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^ {0,3}>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${quoteLines.map((line) => renderMarkdownInline(line)).join('<br />')}</blockquote>`)
      continue
    }

    const unorderedListMatch = currentLine.match(/^ {0,3}[-*+]\s+(.+)$/)
    const orderedListMatch = currentLine.match(/^ {0,3}\d+[.)]\s+(.+)$/)
    if (unorderedListMatch || orderedListMatch) {
      const isOrdered = Boolean(orderedListMatch)
      const items: string[] = []
      const itemPattern = isOrdered ? /^ {0,3}\d+[.)]\s+(.+)$/ : /^ {0,3}[-*+]\s+(.+)$/

      while (index < lines.length) {
        const itemMatch = (lines[index] ?? '').match(itemPattern)
        if (!itemMatch) {
          break
        }

        items.push(`<li>${renderMarkdownInline(itemMatch[1].trim())}</li>`)
        index += 1
      }

      blocks.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`)
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && lines[index]?.trim() && !isBlockStart(lines[index] ?? '')) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }

    blocks.push(`<p>${paragraphLines.map((line) => renderMarkdownInline(line)).join('<br />')}</p>`)
  }

  return blocks.join('')
}

type MixedBlockSegment = {
  type: 'text' | 'code'
  lines: string[]
}

const codeAssignmentTargetPattern = /^[A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|\[[^\]\n]+\])*\s*=/

function isLikelyCodeLine(line: string) {
  const trimmedLine = line.trim()
  if (!trimmedLine) {
    return false
  }

  if (/^@(ai|bot)\b/i.test(trimmedLine)) {
    return false
  }

  if (/^<\/?[a-z][\w.:-]*(?:\s+[^<>]*)?>$/i.test(trimmedLine)) {
    return true
  }

  if (/^[{}()[\];,]+$/.test(trimmedLine)) {
    return true
  }

  if (/^(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|class|import|export|from|async|await|def|print)\b/.test(trimmedLine)) {
    return true
  }

  if (/^(?:\/\/|\/\*|\*\/|#include|#define)\b/.test(trimmedLine)) {
    return true
  }

  if (/^\s/.test(line) && /[{}()[\];=<>]/.test(trimmedLine)) {
    return true
  }

  if (
    /[{}()[\];=<>]/.test(trimmedLine) &&
    (codeAssignmentTargetPattern.test(trimmedLine) ||
      /\b[A-Za-z_$][\w$]*\s*\([^)]*\)/.test(trimmedLine))
  ) {
    return true
  }

  return false
}

function splitMixedLine(line: string) {
  const trimmedLine = line.trim()
  if (!trimmedLine) {
    return []
  }

  const botCodeMatch = /^(@(?:ai|bot))\s+(.*)$/i.exec(trimmedLine)
  if (botCodeMatch && isLikelyCodeLine(botCodeMatch[2])) {
    return [
      { type: 'text' as const, value: botCodeMatch[1] },
      { type: 'code' as const, value: botCodeMatch[2] },
    ]
  }

  const prefixCodeMatch = /^(.*?[：:])\s*(<\/?[a-z][\w.:-]*(?:\s+[^<>]*)?>.*|(?:const|let|var|function|if|for|while|class|import|export)\b.*)$/i.exec(trimmedLine)
  if (prefixCodeMatch && isLikelyCodeLine(prefixCodeMatch[2])) {
    return [
      { type: 'text' as const, value: prefixCodeMatch[1] },
      { type: 'code' as const, value: prefixCodeMatch[2] },
    ]
  }

  return [{ type: isLikelyCodeLine(trimmedLine) ? ('code' as const) : ('text' as const), value: trimmedLine }]
}

function renderMixedTextAndCodeBlocks(value: string) {
  const normalizedValue = normalizeCodeText(value)
  const rawLines = normalizedValue.split('\n')
  const segments: MixedBlockSegment[] = []
  let current: MixedBlockSegment | null = null

  const pushCurrent = () => {
    if (!current || current.lines.length === 0) {
      current = null
      return
    }

    segments.push(current)
    current = null
  }

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      pushCurrent()
      continue
    }

    for (const part of splitMixedLine(rawLine)) {
      if (!current || current.type !== part.type) {
        pushCurrent()
        current = {
          type: part.type,
          lines: [],
        }
      }

      current.lines.push(part.value)
    }
  }

  pushCurrent()

  const hasCode = segments.some((segment) => segment.type === 'code')
  const hasText = segments.some((segment) => segment.type === 'text')
  if (!hasCode || !hasText) {
    return ''
  }

  return segments
    .map((segment) =>
      segment.type === 'code'
        ? renderCodeBlockHtml(segment.lines.join('\n'), detectCodeLanguage(segment.lines.join('\n')))
        : `<p>${segment.lines.map((line) => renderMarkdownInline(line)).join('<br />')}</p>`,
    )
    .join('')
}

function normalizePlainRichText(value: string) {
  const appleMusicLyricShare = renderAppleMusicLyricShare(value)
  if (appleMusicLyricShare) {
    return appleMusicLyricShare
  }

  if (hasMarkdownFence(value)) {
    return renderMarkdownBlocks(value)
  }

  const codeText = normalizeCodeText(value)
  if (shouldRenderPlainTextAsSingleCodeBlock(codeText)) {
    return renderCodeBlockHtml(codeText, detectCodeLanguage(codeText))
  }

  const mixedHtml = renderMixedTextAndCodeBlocks(value)
  if (mixedHtml) {
    return mixedHtml
  }

  if (hasMarkdownSyntax(value)) {
    return renderMarkdownBlocks(value)
  }

  return value.split(/\r?\n/).map((line) => linkifyPlainTextUrls(line)).join('<br />')
}

function renderBotMarkdownReply(value: string) {
  const normalizedValue = normalizeCodeText(value)
  const firstLineBreakIndex = normalizedValue.indexOf('\n')
  const firstLine = firstLineBreakIndex >= 0
    ? normalizedValue.slice(0, firstLineBreakIndex)
    : normalizedValue
  const remainingText = firstLineBreakIndex >= 0
    ? normalizedValue.slice(firstLineBreakIndex + 1).trim()
    : ''
  const mentionMatch = firstLine.match(/^(@\S+)(?:\s+([\s\S]+))?$/)

  if (!mentionMatch) {
    return renderMarkdownBlocks(normalizedValue)
  }

  const [, mention, firstLineText = ''] = mentionMatch
  const normalizedFirstLineText = firstLineText.trim()
  const firstParagraph = [
    '<p>',
    `<strong>${escapeHtml(mention)}</strong>`,
    normalizedFirstLineText && !hasMarkdownSyntax(normalizedFirstLineText)
      ? ` ${renderMarkdownInline(normalizedFirstLineText)}`
      : '',
    '</p>',
  ].join('')
  const remainingMarkdown = [
    hasMarkdownSyntax(normalizedFirstLineText) ? normalizedFirstLineText : '',
    remainingText,
  ].filter(Boolean).join('\n')

  return remainingMarkdown
    ? `${firstParagraph}${renderMarkdownBlocks(remainingMarkdown)}`
    : firstParagraph
}

function hasBotMarkdownSyntax(value: string) {
  if (hasMarkdownFence(value) || hasMarkdownSyntax(value)) {
    return true
  }

  const firstLine = normalizeCodeText(value).split('\n')[0] ?? ''
  const mentionMatch = firstLine.match(/^@\S+\s+([\s\S]+)$/)
  return Boolean(mentionMatch?.[1] && hasMarkdownSyntax(mentionMatch[1].trim()))
}

function extractTextWithLineBreaks(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (!(node instanceof HTMLElement)) {
    return ''
  }

  const tagName = node.tagName.toLowerCase()
  if (tagName === 'br') {
    return '\n'
  }

  const childText = Array.from(node.childNodes).map(extractTextWithLineBreaks).join('')
  if (['div', 'p', 'li', 'tr', 'pre'].includes(tagName)) {
    return `${childText}\n`
  }

  return childText
}

function normalizeCodeText(value: string) {
  return value
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeLanguageLabel(value: string) {
  const normalizedValue = value.trim().replace(/^(language|lang)-/i, '').toLowerCase()
  return /^[\w#+.-]{1,24}$/.test(normalizedValue) ? normalizedValue : ''
}

function detectCodeLanguage(value: string, explicitLanguage = '') {
  const normalizedExplicitLanguage = normalizeLanguageLabel(explicitLanguage)
  if (normalizedExplicitLanguage) {
    return normalizedExplicitLanguage
  }

  const trimmedValue = value.trim()
  const firstLine = trimmedValue.split('\n').find(Boolean)?.trim() ?? ''

  if (/^<[/!]?[a-z][\w.:-]*(?:\s|>|$)/i.test(firstLine)) {
    return /\bclassName=|[{][\w\s.[\]'"`]+[}]|<\/?[A-Z]/.test(trimmedValue) ? 'tsx' : 'html'
  }

  if (/^\s*[{[]/.test(trimmedValue)) {
    try {
      JSON.parse(trimmedValue)
      return 'json'
    } catch {
      // Continue with other lightweight heuristics.
    }
  }

  if (
    /^\s*#\s*(?:include|define|ifdef|ifndef|endif|if|elif|else|pragma|undef|error)\b/m.test(trimmedValue) ||
    /\b(?:struct|typedef|enum|union)\s+\w+|\b(?:int|char|float|double|void|long|short|unsigned|signed)\s+\w+\s*(?:[;=,(]|\[)/.test(trimmedValue)
  ) {
    return /\b(?:namespace|template|class)\b|std::|#\s*include\s*<iostream>/.test(trimmedValue) ? 'cpp' : 'c'
  }

  if (/\b(?:interface|type)\s+\w+|:\s*(?:string|number|boolean|unknown|ReactNode)\b|<[A-Z][\w.]*/.test(trimmedValue)) {
    return 'ts'
  }

  if (
    /^\s*#.*python/m.test(trimmedValue) ||
    /^\s*(?:from\s+\w+(?:\.\w+)*\s+import\s+|import\s+\w+(?:\.\w+)*(?:\s+as\s+\w+)?\s*$|def\s+\w+\s*\(|print\s*\()/m.test(trimmedValue) ||
    /\blambda\b|\.DataFrame\s*\(/.test(trimmedValue) ||
    (
      /^\s*#\s*\S/m.test(trimmedValue) &&
      /^\s*[A-Za-z_]\w*\s*=\s*[^=\n]+/m.test(trimmedValue)
    )
  ) {
    return 'python'
  }

  if (/\b(?:import|export|const|let|var|function|return|class|await|async)\b/.test(trimmedValue)) {
    return /\bclassName=|<[A-Z][\w.]*|:\s*(?:string|number|boolean|unknown)\b/.test(trimmedValue) ? 'ts' : 'js'
  }

  if (/^[.#]?[\w-]+\s*{[\s\S]*:\s*[^;]+;?[\s\S]*}$/m.test(trimmedValue)) {
    return 'css'
  }

  if (/^(?:npm|pnpm|yarn|git|cd|mkdir|rm|cp|mv|curl|ssh)\b/.test(firstLine)) {
    return 'shell'
  }

  return 'code'
}

function renderHighlightedSegments(
  value: string,
  pattern: RegExp,
  resolveClassName: (token: string) => string,
) {
  let html = ''
  let lastIndex = 0

  pattern.lastIndex = 0
  for (const match of value.matchAll(pattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index < lastIndex) {
      continue
    }

    html += escapeHtml(value.slice(lastIndex, index))

    const className = resolveClassName(token)
    html += className
      ? `<span class="${className}">${escapeHtml(token)}</span>`
      : escapeHtml(token)

    lastIndex = index + token.length
  }

  html += escapeHtml(value.slice(lastIndex))
  return html
}

function highlightMarkupCode(value: string) {
  const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w.:-]*|\/?>|[A-Za-z_:][\w:.-]*(?==)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|export|const|let|var|function|return|class|interface|type|if|else|for|while|await|async|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|[{}()[\];=]/g

  return renderHighlightedSegments(value, pattern, (token) => {
    if (token.startsWith('<!--')) {
      return 'dd-token dd-token--comment'
    }

    if (token.startsWith('<') || token === '>' || token === '/>') {
      return 'dd-token dd-token--tag'
    }

    if (token.startsWith('"') || token.startsWith("'")) {
      return 'dd-token dd-token--string'
    }

    if (/^\d/.test(token)) {
      return 'dd-token dd-token--number'
    }

    if (/^[{}()[\];=]$/.test(token)) {
      return 'dd-token dd-token--punctuation'
    }

    if (/^(?:import|export|const|let|var|function|return|class|interface|type|if|else|for|while|await|async|true|false|null|undefined)$/.test(token)) {
      return 'dd-token dd-token--keyword'
    }

    return 'dd-token dd-token--attr'
  })
}

function highlightCssCode(value: string) {
  const pattern = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|@[a-z-]+|[A-Za-z-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b|[{}:;(),]/gi

  return renderHighlightedSegments(value, pattern, (token) => {
    if (token.startsWith('/*')) {
      return 'dd-token dd-token--comment'
    }

    if (token.startsWith('"') || token.startsWith("'")) {
      return 'dd-token dd-token--string'
    }

    if (token.startsWith('#')) {
      return 'dd-token dd-token--number'
    }

    if (token.startsWith('@')) {
      return 'dd-token dd-token--keyword'
    }

    if (/^\d/.test(token)) {
      return 'dd-token dd-token--number'
    }

    if (/^[{}:;(),]$/.test(token)) {
      return 'dd-token dd-token--punctuation'
    }

    return 'dd-token dd-token--property'
  })
}

function highlightShellCode(value: string) {
  const pattern = /#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$[A-Za-z_][\w]*|\b(?:npm|pnpm|yarn|git|cd|mkdir|rm|cp|mv|curl|ssh|node|npx)\b|--?[A-Za-z][\w-]*/g

  return renderHighlightedSegments(value, pattern, (token) => {
    if (token.startsWith('#')) {
      return 'dd-token dd-token--comment'
    }

    if (token.startsWith('"') || token.startsWith("'")) {
      return 'dd-token dd-token--string'
    }

    if (token.startsWith('$')) {
      return 'dd-token dd-token--property'
    }

    if (token.startsWith('-')) {
      return 'dd-token dd-token--attr'
    }

    return 'dd-token dd-token--keyword'
  })
}

function highlightCCode(value: string) {
  const pattern = /^\s*#\s*\w+.*|\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:auto|break|case|char|class|const|continue|default|delete|do|double|else|enum|extern|float|for|goto|if|inline|int|long|namespace|new|private|protected|public|register|restrict|return|short|signed|sizeof|static|struct|switch|template|this|typedef|typename|union|unsigned|using|void|volatile|while)\b|\b\d+(?:\.\d+)?\b|[{}()[\];=<>:.,*&+-]/gm

  return renderHighlightedSegments(value, pattern, (token) => {
    if (token.trimStart().startsWith('#')) {
      return 'dd-token dd-token--keyword'
    }

    if (token.startsWith('//') || token.startsWith('/*')) {
      return 'dd-token dd-token--comment'
    }

    if (token.startsWith('"') || token.startsWith("'")) {
      return 'dd-token dd-token--string'
    }

    if (/^\d/.test(token)) {
      return 'dd-token dd-token--number'
    }

    if (/^[{}()[\];=<>:.,*&+-]$/.test(token)) {
      return 'dd-token dd-token--punctuation'
    }

    return 'dd-token dd-token--keyword'
  })
}

function highlightScriptCode(value: string) {
  const pattern = /\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|export|default|const|let|var|function|return|class|extends|interface|type|if|else|for|while|switch|case|break|continue|try|catch|finally|await|async|new|this|true|false|null|undefined|typeof|in|of)\b|\b\d+(?:\.\d+)?\b|[{}()[\];=<>:.,]/g

  return renderHighlightedSegments(value, pattern, (token) => {
    if (token.startsWith('//') || token.startsWith('/*')) {
      return 'dd-token dd-token--comment'
    }

    if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      return 'dd-token dd-token--string'
    }

    if (/^\d/.test(token)) {
      return 'dd-token dd-token--number'
    }

    if (/^[{}()[\];=<>:.,]$/.test(token)) {
      return 'dd-token dd-token--punctuation'
    }

    return 'dd-token dd-token--keyword'
  })
}

function highlightCodeHtml(value: string, language: string) {
  if (['html', 'xml', 'tsx', 'jsx', 'vue', 'svelte'].includes(language)) {
    return highlightMarkupCode(value)
  }

  if (language === 'css') {
    return highlightCssCode(value)
  }

  if (language === 'shell' || language === 'bash' || language === 'sh') {
    return highlightShellCode(value)
  }

  if (language === 'c' || language === 'cpp') {
    return highlightCCode(value)
  }

  if (['js', 'javascript', 'ts', 'typescript', 'json', 'python', 'py'].includes(language)) {
    return highlightScriptCode(value)
  }

  return escapeHtml(value)
}

function isCompleteHtmlDocument(value: string) {
  const trimmedValue = value.trim()
  return (
    /^(?:<!doctype\s+html[^>]*>\s*)?<html\b/i.test(trimmedValue) &&
    /<head\b[\s\S]*<\/head>/i.test(trimmedValue) &&
    /<body\b[\s\S]*<\/body>/i.test(trimmedValue) &&
    /<\/html>\s*$/i.test(trimmedValue)
  )
}

const HTML_DOCUMENT_IFRAME_SANDBOX = 'allow-scripts'

function createHtmlDocumentPreviewFrame(codeText: string, className: string, title: string) {
  const frame = document.createElement('iframe')
  frame.className = className
  frame.title = title
  frame.loading = 'lazy'
  frame.setAttribute('sandbox', HTML_DOCUMENT_IFRAME_SANDBOX)
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.srcdoc = codeText
  return frame
}

function getHtmlDocumentSource(documentBlock: HTMLElement) {
  return documentBlock.querySelector<HTMLElement>('.dd-html-document__code-block code')?.textContent ?? ''
}

export function openHtmlDocumentFullscreenPreview(control: HTMLElement) {
  const documentBlock = control.closest<HTMLElement>('.dd-html-document')
  const dialog = documentBlock?.querySelector<HTMLDialogElement>('.dd-html-document__dialog')
  const preview = dialog?.querySelector<HTMLElement>('.dd-html-document__dialog-preview')
  if (!documentBlock || !dialog || !preview) {
    return false
  }

  if (!preview.querySelector('iframe')) {
    const codeText = getHtmlDocumentSource(documentBlock)
    if (!codeText.trim()) {
      return false
    }

    preview.replaceChildren(createHtmlDocumentPreviewFrame(codeText, 'dd-html-document__dialog-frame', 'HTML 全屏预览'))
  }

  if (!dialog.dataset.backdropClickLocked) {
    dialog.dataset.backdropClickLocked = 'true'
    dialog.addEventListener('click', (dialogEvent) => {
      if (dialogEvent.target !== dialog) {
        return
      }

      dialogEvent.preventDefault()
      dialogEvent.stopPropagation()
    })
  }

  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
  }

  return true
}

function renderHtmlDocumentBlockHtml(codeText: string, languageLabel: string) {
  return [
    '<div class="dd-html-document">',
    `<pre class="dd-code-block dd-html-document__code-block" data-language="${escapeHtml(languageLabel)}">`,
    '<div class="dd-code-block__header dd-html-document__header">',
    `<span class="dd-code-block__language">${escapeHtml(languageLabel)}</span>`,
    '<button type="button" class="dd-html-document__fullscreen">全屏</button>',
    '<button type="button" class="dd-code-copy">复制</button>',
    '</div>',
    `<code>${highlightCodeHtml(codeText, languageLabel)}</code>`,
    '</pre>',
    '<dialog class="dd-html-document__dialog" aria-label="HTML 全屏预览">',
    '<div class="dd-html-document__dialog-header">',
    '<strong>HTML 预览</strong>',
    '<form method="dialog">',
    '<button type="submit" class="dd-html-document__dialog-close">退出</button>',
    '</form>',
    '</div>',
    '<div class="dd-html-document__dialog-preview"></div>',
    '</dialog>',
    '</div>',
  ].join('')
}

function renderCodeBlockHtml(codeText: string, language: string) {
  const languageLabel = detectCodeLanguage(codeText, language)
  if (languageLabel === 'html' && isCompleteHtmlDocument(codeText)) {
    return renderHtmlDocumentBlockHtml(codeText, languageLabel)
  }

  const codeBlockHtml = [
    `<pre class="dd-code-block" data-language="${escapeHtml(languageLabel)}">`,
    '<div class="dd-code-block__header">',
    `<span class="dd-code-block__language">${escapeHtml(languageLabel)}</span>`,
    '<button type="button" class="dd-code-copy">复制</button>',
    '</div>',
    `<code>${highlightCodeHtml(codeText, languageLabel)}</code>`,
    '</pre>',
  ].join('')

  return codeBlockHtml
}

function shouldRenderAsCodeBlock(value: string, root: Element) {
  if (/<pre\b/i.test(value)) {
    return false
  }

  const codeText = normalizeCodeText(extractTextWithLineBreaks(root))
  return shouldRenderPlainTextAsSingleCodeBlock(codeText, root.querySelectorAll('span[class], span[style], font[color]').length)
}

function shouldRenderPlainTextAsSingleCodeBlock(codeText: string, styledSpanCount = 0) {
  if (/^\s*@(ai|bot)\b/im.test(codeText)) {
    return false
  }

  return shouldRenderCodeTextAsBlock(codeText, styledSpanCount)
}

function shouldRenderCodeTextAsBlock(codeText: string, styledSpanCount = 0) {
  const lines = codeText.split('\n').map((line) => line.trimEnd()).filter(Boolean)
  const hasLineBreak = lines.length > 1
  if (!hasLineBreak) {
    return false
  }

  const hasMarkupCode = /<\/?[a-z][\w.:-]*(?:\s+[^<>]*)?>/i.test(codeText)
  const hasCodeKeyword = /^\s*#\s*(?:include|define|ifdef|ifndef|endif|if|elif|else|pragma|undef|error)\b/m.test(codeText)
    || /\b(?:import|from|export|const|let|var|function|return|class|interface|type|if|else|for|while|await|async|struct|typedef|enum|union|int|char|float|double|void|print|lambda|def)\b/.test(codeText)
  const hasCodePunctuation = /[{}()[\];=<>]/.test(codeText)
  const hasIndentedLine = lines.some((line) => /^(?: {2,}|\t)/.test(line))
  const hasCommentLine = lines.some((line) => /^(?:#|\/\/|\/\*)/.test(line.trimStart()))
  const hasAssignmentLine = lines.some((line) =>
    codeAssignmentTargetPattern.test(line.trimStart()),
  )
  const hasCallExpression = /\b[A-Za-z_$][\w$]*\s*\([^)\n]*\)/.test(codeText)

  return (
    hasMarkupCode ||
    (styledSpanCount >= 2 && hasCodePunctuation) ||
    (lines.length >= 2 && hasCodePunctuation && hasAssignmentLine && (hasCallExpression || hasCommentLine)) ||
    (lines.length >= 3 && hasCodePunctuation && (hasCodeKeyword || hasIndentedLine))
  )
}

function sanitizeStyleAttribute(style: CSSStyleDeclaration) {
  const declarations: string[] = []
  const allowedProperties = ['color', 'font-family', 'font-size', 'text-align', 'text-indent', 'margin-left']

  for (const property of allowedProperties) {
    const value = style.getPropertyValue(property).trim()
    if (value) {
      declarations.push(`${property}: ${value}`)
    }
  }

  return declarations.join('; ')
}

export function extractPlainTextFromRichText(value: string) {
  if (!value) {
    return ''
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value.replace(/\u200B/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const text = documentFragment.body.textContent ?? ''
  return text.replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function hasRichTextImage(value: string) {
  if (!value) {
    return false
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return /<img\b/i.test(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  return Boolean(documentFragment.body.querySelector('img[src]'))
}

export function sanitizeRichTextHtml(value: string) {
  if (!value) {
    return ''
  }

  const normalizedRawValue = normalizeCodeText(value)
  if (isCompleteHtmlDocument(normalizedRawValue)) {
    return renderCodeBlockHtml(normalizedRawValue, 'html')
  }

  if (hasMarkdownFence(normalizedRawValue)) {
    return renderMarkdownBlocks(normalizedRawValue)
  }

  if (!/[<>]/.test(value) || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return normalizePlainRichText(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return normalizePlainRichText(value)
  }

  const hasChatQuote = Boolean(root.querySelector('blockquote.dd-chatbox__quote'))
  const appleMusicLyricShare = renderAppleMusicLyricShare(extractTextWithLineBreaks(root))
  if (appleMusicLyricShare) {
    return appleMusicLyricShare
  }

  if (!hasChatQuote) {
    // HTML structural elements (form, table, etc.) — show raw source, not extracted text
    if (/<(?:form|table|thead|tbody|tr|td|th|select|option|fieldset|legend|label)\b/i.test(value)) {
      const codeText = normalizeCodeText(value)
      return renderCodeBlockHtml(codeText, detectCodeLanguage(codeText))
    }

    if (shouldRenderAsCodeBlock(value, root)) {
      const codeText = normalizeCodeText(extractTextWithLineBreaks(root))
      return renderCodeBlockHtml(codeText, detectCodeLanguage(codeText))
    }

    const mixedHtml = renderMixedTextAndCodeBlocks(extractTextWithLineBreaks(root))
    if (mixedHtml) {
      return mixedHtml
    }
  }

  const allowedTags = new Set([
    'a',
    'audio',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'font',
    'h1',
    'h2',
    'h3',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'span',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ])

  const sanitizeNode = (node: Node, linkifyText = true): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u200B/g, '')
      return linkifyText ? linkifyPlainTextUrls(text) : escapeHtml(text)
    }

    if (!(node instanceof HTMLElement)) {
      return ''
    }

    const tagName = node.tagName.toLowerCase()
    const shouldLinkifyChildren = !['a', 'code', 'pre'].includes(tagName)
    const childrenHtml = Array.from(node.childNodes)
      .map((childNode) => sanitizeNode(childNode, shouldLinkifyChildren))
      .join('')

    if (!allowedTags.has(tagName)) {
      return childrenHtml
    }

    if (tagName === 'pre') {
      const classLanguage = Array.from(node.classList)
        .find((className) => /^(language|lang)-[\w#+.-]+$/i.test(className))
        ?.replace(/^(language|lang)-/i, '')
      const codeElement = node.querySelector('code')
      const codeClassLanguage = codeElement
        ? Array.from(codeElement.classList)
            .find((className) => /^(language|lang)-[\w#+.-]+$/i.test(className))
            ?.replace(/^(language|lang)-/i, '')
        : ''
      const explicitLanguage = node.getAttribute('data-language')?.trim() || classLanguage || codeClassLanguage || ''
      const codeText = normalizeCodeText(codeElement?.textContent ?? extractTextWithLineBreaks(node))
      return renderCodeBlockHtml(codeText, explicitLanguage)
    }

    const attributes: string[] = []
    const styleDeclarations: string[] = []
    const sanitizedStyle = sanitizeStyleAttribute(node.style)
    if (sanitizedStyle) {
      styleDeclarations.push(sanitizedStyle)
    }

    const align = node.getAttribute('align')?.trim()
    if (align && ['left', 'center', 'right', 'justify'].includes(align.toLowerCase())) {
      styleDeclarations.push(`text-align: ${align.toLowerCase()}`)
    }

    if (tagName === 'a') {
      const href = node.getAttribute('href')?.trim() ?? ''
      if (isSafeUrl(href, 'href')) {
        const appleMusicCard = renderAppleMusicCard(href)
        if (appleMusicCard) {
          return appleMusicCard
        }

        attributes.push(`href="${escapeHtml(href)}"`)
        attributes.push('target="_blank"')
        attributes.push('rel="noreferrer noopener"')
      }
    }

    if (tagName === 'img') {
      const src = node.getAttribute('src')?.trim() ?? ''
      if (!isSafeUrl(src, 'src')) {
        return ''
      }

      attributes.push(`src="${escapeHtml(src)}"`)
      const alt = node.getAttribute('alt')?.trim() ?? ''
      if (alt) {
        attributes.push(`alt="${escapeHtml(alt)}"`)
      }
    }

    if (tagName === 'audio') {
      const src = node.getAttribute('src')?.trim() ?? ''
      if (!isSafeUrl(src, 'src')) {
        return ''
      }

      attributes.push(`src="${escapeHtml(src)}"`)
      attributes.push('controls')
    }

    if (tagName === 'font') {
      const color = node.getAttribute('color')?.trim()
      if (color) {
        styleDeclarations.push(`color: ${color}`)
      }

      const face = node.getAttribute('face')?.trim()
      if (face) {
        styleDeclarations.push(`font-family: ${face}`)
      }

      const size = node.getAttribute('size')?.trim()
      const sizeMap: Record<string, string> = {
        '1': '12px',
        '2': '13px',
        '3': '14px',
        '4': '16px',
        '5': '18px',
        '6': '24px',
        '7': '32px',
      }
      if (size && sizeMap[size]) {
        styleDeclarations.push(`font-size: ${sizeMap[size]}`)
      }
    }

    if (tagName === 'td' || tagName === 'th') {
      const colspan = node.getAttribute('colspan')?.trim()
      if (colspan && /^\d+$/.test(colspan)) {
        attributes.push(`colspan="${colspan}"`)
      }

      const rowspan = node.getAttribute('rowspan')?.trim()
      if (rowspan && /^\d+$/.test(rowspan)) {
        attributes.push(`rowspan="${rowspan}"`)
      }
    }

    if (tagName === 'br') {
      return '<br />'
    }

    if (styleDeclarations.length > 0) {
      const mergedStyle = Array.from(new Set(styleDeclarations)).join('; ')
      attributes.push(`style="${escapeHtml(mergedStyle)}"`)
    }

    const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
    return `<${tagName}${attributeString}>${childrenHtml}</${tagName}>`
  }

  return Array.from(root.childNodes).map((node) => sanitizeNode(node)).join('')
}

export function sanitizeBotReplyHtml(value: string) {
  const normalizedRawValue = normalizeCodeText(value)
  if (isCompleteHtmlDocument(normalizedRawValue)) {
    return renderCodeBlockHtml(normalizedRawValue, 'html')
  }

  if (hasMarkdownFence(normalizedRawValue)) {
    return renderBotMarkdownReply(normalizedRawValue)
  }

  if (!value || !/[<>]/.test(value) || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return normalizePlainRichText(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return normalizePlainRichText(value)
  }

  const plainText = normalizeCodeText(extractTextWithLineBreaks(root))
  if (hasMarkdownFence(plainText)) {
    return renderBotMarkdownReply(plainText)
  }

  if (shouldRenderPlainTextAsSingleCodeBlock(plainText)) {
    return renderCodeBlockHtml(plainText, detectCodeLanguage(plainText))
  }

  if (hasBotMarkdownSyntax(plainText)) {
    return renderBotMarkdownReply(plainText)
  }

  const mixedHtml = renderMixedTextAndCodeBlocks(plainText)
  if (mixedHtml) {
    return mixedHtml
  }

  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml((node.textContent ?? '').replace(/\u200B/g, ''))
    }

    if (!(node instanceof HTMLElement)) {
      return ''
    }

    const childrenHtml = Array.from(node.childNodes).map(sanitizeNode).join('')
    const tagName = node.tagName.toLowerCase()

    if (tagName === 'br') {
      return '<br />'
    }

    if (tagName === 'strong') {
      return `<strong>${childrenHtml}</strong>`
    }

    if (tagName === 'p') {
      return `<p>${childrenHtml}</p>`
    }

    return childrenHtml
  }

  return Array.from(root.childNodes).map(sanitizeNode).join('')
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null
}

async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    return new Promise<File[]>((resolve, reject) => {
      fileEntry.file(
        (file) => resolve([file]),
        (error) => reject(error),
      )
    })
  }

  if (entry.isDirectory) {
    const directoryEntry = entry as FileSystemDirectoryEntry
    const reader = directoryEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const allEntries: FileSystemEntry[] = []

      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              resolve(allEntries)
              return
            }

            allEntries.push(...batch)
            readBatch()
          },
          (error) => reject(error),
        )
      }

      readBatch()
    })

    const nestedFiles = await Promise.all(entries.map((child) => readEntryFiles(child)))
    return nestedFiles.flat()
  }

  return []
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithEntry[]
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry))

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? [])
  }

  const batches = await Promise.all(entries.map((entry) => readEntryFiles(entry)))
  return batches.flat()
}
