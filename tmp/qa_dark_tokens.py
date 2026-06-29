from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    light = browser.new_page(viewport={'width': 1280, 'height': 860})
    light.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    light.wait_for_selector('.dd-snaplink__app', timeout=30000)
    light.wait_for_timeout(1200)
    light_vars = light.evaluate("""() => {
      const root = document.querySelector('.dd-snaplink')
      const styles = getComputedStyle(root)
      return {
        snapBg: styles.getPropertyValue('--snap-bg').trim(),
        snapSurface: styles.getPropertyValue('--snap-surface').trim(),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    }""")
    light.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-theme-light-token-check.png', full_page=True)

    dark = browser.new_page(viewport={'width': 1280, 'height': 860})
    dark.add_init_script("""() => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme-mode', 'dark')
    }""")
    dark.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    dark.wait_for_selector('.dd-snaplink__app', timeout=30000)
    dark.wait_for_timeout(1200)
    dark_vars = dark.evaluate("""() => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme-mode', 'dark')
      const root = document.querySelector('.dd-snaplink')
      const styles = getComputedStyle(root)
      return {
        snapBg: styles.getPropertyValue('--snap-bg').trim(),
        snapSurface: styles.getPropertyValue('--snap-surface').trim(),
        snapInk: styles.getPropertyValue('--snap-ink').trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    }""")
    dark.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-theme-dark-token-check.png', full_page=True)
    print({'light': light_vars, 'dark': dark_vars})
    browser.close()
