export type ClipboardImage = {
  dataUrl: string
  mimeType: 'image/png'
}

export async function copyImageDataUrlToClipboard({ dataUrl, mimeType }: ClipboardImage) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器不支持复制图片。')
  }

  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const clipboardBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType)

  await navigator.clipboard.write([
    new ClipboardItem({
      [mimeType]: clipboardBlob,
    }),
  ])
}
