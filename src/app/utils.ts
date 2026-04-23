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

function normalizePlainRichText(value: string) {
  const appleMusicLyricShare = renderAppleMusicLyricShare(value)
  if (appleMusicLyricShare) {
    return appleMusicLyricShare
  }

  const codeText = normalizeCodeText(value)
  if (shouldRenderCodeTextAsBlock(codeText)) {
    return renderCodeBlockHtml(codeText, detectCodeLanguage(codeText))
  }

  return value.split(/\r?\n/).map((line) => linkifyPlainTextUrls(line)).join('<br />')
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

function renderCodeBlockHtml(codeText: string, language: string) {
  const languageLabel = detectCodeLanguage(codeText, language)
  return [
    `<pre class="dd-code-block" data-language="${escapeHtml(languageLabel)}">`,
    '<div class="dd-code-block__header">',
    `<span class="dd-code-block__language">${escapeHtml(languageLabel)}</span>`,
    '<button type="button" class="dd-code-copy">复制</button>',
    '</div>',
    `<code>${highlightCodeHtml(codeText, languageLabel)}</code>`,
    '</pre>',
  ].join('')
}

function shouldRenderAsCodeBlock(value: string, root: Element) {
  if (/<pre\b/i.test(value)) {
    return false
  }

  const codeText = normalizeCodeText(extractTextWithLineBreaks(root))
  return shouldRenderCodeTextAsBlock(
    codeText,
    root.querySelectorAll('span[class], span[style], font[color]').length,
  )
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
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*=/.test(line.trimStart()),
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

  if (!/[<>]/.test(value) || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return normalizePlainRichText(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return normalizePlainRichText(value)
  }

  const appleMusicLyricShare = renderAppleMusicLyricShare(extractTextWithLineBreaks(root))
  if (appleMusicLyricShare) {
    return appleMusicLyricShare
  }

  if (shouldRenderAsCodeBlock(value, root)) {
    const codeText = normalizeCodeText(extractTextWithLineBreaks(root))
    return renderCodeBlockHtml(codeText, detectCodeLanguage(codeText))
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
      const explicitLanguage = node.getAttribute('data-language')?.trim() || classLanguage || ''
      const codeText = normalizeCodeText(extractTextWithLineBreaks(node))
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
  if (!value || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return normalizePlainRichText(value)
  }

  const parser = new DOMParser()
  const documentFragment = parser.parseFromString(`<div>${value}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) {
    return normalizePlainRichText(value)
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
