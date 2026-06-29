from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 860})
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1000)
    desktop_results = []
    for label in ['附近设备','房间','文件','传输','文本','历史','设置']:
        locator = page.locator(f'.dd-snaplink__rail button:has-text("{label}")').first
        locator.click()
        page.wait_for_timeout(350)
        desktop_results.append(page.evaluate("""(label) => ({
          label,
          activeRail: Array.from(document.querySelectorAll('.dd-snaplink__rail button.is-active')).map(el => el.textContent.trim()).join('|'),
          pageClasses: Array.from(document.querySelectorAll('.dd-snaplink__workbench-page')).map(el => el.className).join('|'),
          url: location.pathname,
          queueVisible: !!document.querySelector('.dd-snaplink__queue'),
        })""", label))
    page.screenshot(path=str(OUT / 'dd-desktop-nav-audit.png'), full_page=True)
    page.close()

    mob = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
    mob.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    mob.wait_for_selector('.dd-snaplink__app', timeout=30000)
    mob.wait_for_timeout(1000)
    mobile_results = []
    for label in ['附近','房间','文件','传输','文本','历史','设置']:
        locator = mob.locator(f'.dd-snaplink__mobile-workbench-nav button:has-text("{label}")').first
        locator.click()
        mob.wait_for_timeout(350)
        mobile_results.append(mob.evaluate("""(label) => ({
          label,
          activeMobile: Array.from(document.querySelectorAll('.dd-snaplink__mobile-workbench-nav button.is-active')).map(el => el.textContent.trim()).join('|'),
          pageClasses: Array.from(document.querySelectorAll('.dd-snaplink__workbench-page')).map(el => el.className).join('|'),
          xOverflow: document.documentElement.scrollWidth > window.innerWidth,
          actionbar: !!document.querySelector('.dd-snaplink__mobile-actionbar'),
          queue: !!document.querySelector('.dd-snaplink__queue'),
        })""", label))
    mob.screenshot(path=str(OUT / 'dd-mobile-nav-audit.png'), full_page=True)
    mob.close()
    browser.close()

print({'desktop': desktop_results, 'mobile': mobile_results})
