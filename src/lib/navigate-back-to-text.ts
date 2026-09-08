export function navigateBackToText() {
  if (typeof window === 'undefined') {
    return
  }

  const returnMode = sessionStorage.getItem('dd_tool_return_mode')
  if (returnMode) {
    sessionStorage.removeItem('dd_tool_return_mode')
    const targetUrl = `/?mode=${encodeURIComponent(returnMode)}`
    window.history.pushState(window.history.state, '', targetUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }

  if (window.history.length > 1) {
    window.history.back()
    return
  }

  window.history.pushState(window.history.state, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
