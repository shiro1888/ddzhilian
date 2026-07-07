export type ClipboardImage = {
  dataUrl: string
  mimeType: 'image/png'
}

function copyTextWithTextarea(value: string) {
  if (typeof document === 'undefined') {
    return false
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

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall back to the legacy textarea path below.
    }
  }

  return copyTextWithTextarea(value)
}

export async function copyImageDataUrlToClipboard({ dataUrl, mimeType }: ClipboardImage) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const clipboardBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType)

      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: clipboardBlob,
        }),
      ])
      return
    } catch {
      // Fall back to copying the data URL as text below.
    }
  }

  if (await copyTextToClipboard(dataUrl)) {
    return
  }

  throw new Error('当前浏览器不支持复制图片。')
}
