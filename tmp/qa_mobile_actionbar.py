from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':375,'height':812}, is_mobile=True)
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1000)
    for label in ['附近','房间','文件','传输','文本','历史','设置']:
        page.locator(f'.dd-snaplink__mobile-workbench-nav button:has-text("{label}")').first.click()
        page.wait_for_timeout(450)
        results.append(page.evaluate("""(label) => {
          const queue = document.querySelector('.dd-snaplink__workbench > .dd-snaplink__queue');
          const queueBox = queue ? queue.getBoundingClientRect() : null;
          return {
            label,
            active: Array.from(document.querySelectorAll('.dd-snaplink__mobile-workbench-nav button.is-active')).map(el => el.textContent.trim()).join('|'),
            hasActionbar: !!document.querySelector('.dd-snaplink__mobile-actionbar'),
            hasMobileActionsClass: !!document.querySelector('.dd-snaplink__workbench.has-mobile-actions'),
            hasNoMobileActionsClass: !!document.querySelector('.dd-snaplink__workbench.has-no-mobile-actions'),
            queueVisible: !!queue,
            queueBottom: queueBox ? Math.round(window.innerHeight - queueBox.bottom) : None,
            xOverflow: document.documentElement.scrollWidth > window.innerWidth,
          }
        }""", label))
        page.screenshot(path=str(OUT / f"dd-mobile-actionbar-{label}.png"), full_page=False)
    browser.close()
print(results)
