let fallbackIdCounter = 0

export function createBrowserId(prefix = 'id') {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined

  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }

  fallbackIdCounter = (fallbackIdCounter + 1) % Number.MAX_SAFE_INTEGER

  if (typeof cryptoObject?.getRandomValues === 'function') {
    const values = new Uint32Array(2)
    cryptoObject.getRandomValues(values)
    return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`
  }

  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2)}`
}
