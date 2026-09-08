const snapLinkTrustedDevicesStorageKey = 'ddzhilian:trusted-devices:v1'
const snapLinkAvatarStorageKey = 'dd_avatar'
const snapLinkAvatarDataUrlPattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function normalizeSnapLinkAvatarDataUrl(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? ''
  if (
    !normalizedValue ||
    !snapLinkAvatarDataUrlPattern.test(normalizedValue)
  ) {
    return null
  }

  return normalizedValue
}

export function readStoredSnapLinkTrustedDeviceIds() {
  if (typeof window === 'undefined') {
    return new Set<string>()
  }

  try {
    const rawValue = window.localStorage.getItem(snapLinkTrustedDevicesStorageKey)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    if (!Array.isArray(parsedValue)) {
      return new Set<string>()
    }

    return new Set(
      parsedValue.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    )
  } catch {
    return new Set<string>()
  }
}

export function writeStoredSnapLinkTrustedDeviceIds(deviceIds: Set<string>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      snapLinkTrustedDevicesStorageKey,
      JSON.stringify(Array.from(deviceIds).sort()),
    )
  } catch {
    // localStorage may be unavailable in private contexts; trust state then remains in memory for this tab.
  }
}

export function readStoredSnapLinkAvatar() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const storedValue = window.localStorage.getItem(snapLinkAvatarStorageKey)
    const normalizedValue = normalizeSnapLinkAvatarDataUrl(storedValue)
    if (storedValue && !normalizedValue) {
      window.localStorage.removeItem(snapLinkAvatarStorageKey)
    }
    return normalizedValue
  } catch {
    return null
  }
}

export function writeStoredSnapLinkAvatar(value: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const normalizedValue = normalizeSnapLinkAvatarDataUrl(value)
    if (normalizedValue) {
      window.localStorage.setItem(snapLinkAvatarStorageKey, normalizedValue)
    } else {
      window.localStorage.removeItem(snapLinkAvatarStorageKey)
    }
  } catch {
    // Avatar is local-only; if storage is unavailable, keep the in-memory preview for this tab.
  }
}

export function createSnapLinkAvatarDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('头像读取失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('头像图片解析失败'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 256
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('当前浏览器不支持头像裁切'))
          return
        }

        const scale = Math.max(size / image.width, size / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      image.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}
