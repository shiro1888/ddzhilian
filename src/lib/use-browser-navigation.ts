import { useCallback, useEffect, useState } from 'react'

type BrowserLocation = {
  pathname: string
  search: string
}

type NavigateOptions = {
  replace?: boolean
}

function readBrowserLocation(): BrowserLocation {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '' }
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search,
  }
}

export function useBrowserNavigation() {
  const [location, setLocation] = useState(readBrowserLocation)

  useEffect(() => {
    const syncLocation = () => setLocation(readBrowserLocation())
    window.addEventListener('popstate', syncLocation)
    syncLocation()

    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  const navigate = useCallback((destination: string, options: NavigateOptions = {}) => {
    const url = new URL(destination, window.location.href)
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href)
      return
    }

    const nextLocation = `${url.pathname}${url.search}${url.hash}`
    if (options.replace) {
      window.history.replaceState(window.history.state, '', nextLocation)
    } else {
      window.history.pushState(window.history.state, '', nextLocation)
    }
    setLocation(readBrowserLocation())
  }, [])

  return { location, navigate }
}
