export function navigateBackToText() {
  if (typeof window === 'undefined') {
    return
  }

  const returnMode = sessionStorage.getItem('dd_tool_return_mode')
  if (returnMode) {
    sessionStorage.removeItem('dd_tool_return_mode')
    window.location.href = `/text?mode=${encodeURIComponent(returnMode)}`
    return
  }

  if (window.history.length > 1) {
    window.history.back()
    return
  }

  window.location.href = '/text'
}
