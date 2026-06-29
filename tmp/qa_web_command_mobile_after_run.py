from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path('output/chrome-qa')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    page.goto('http://localhost:3000/web-command', wait_until='networkidle')
    page.get_by_role('button', name='运行', exact=True).click()
    expect(page.locator('.dd-web-command__result')).to_contain_text('answer = 42', timeout=15000)
    page.screenshot(path=str(out / 'web-command-mobile-after-run.png'), full_page=True)
    info = page.evaluate('''() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sourceHidden: getComputedStyle(document.querySelector('.dd-web-command__source')).display === 'none',
      outputVisible: !!document.querySelector('.dd-web-command__output')?.offsetParent,
      activeTab: [...document.querySelectorAll('.dd-web-command__mobile-tabs button')].map(b => ({text:b.textContent.trim(), active:b.classList.contains('is-active')})),
      buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()).slice(0, 30)
    })''')
    print(info)
    browser.close()
