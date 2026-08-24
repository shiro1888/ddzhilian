export function navigateBackToText() {
  if (typeof window === 'undefined') {
    return
  }

  if (window.history.length > 1) {
    window.history.back()
    return
  }

  window.location.href = '/text'
}
