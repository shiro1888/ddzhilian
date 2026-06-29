from pathlib import Path
from playwright.sync_api import sync_playwright

out_dir = Path('output/chrome-qa')
out_dir.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto('http://localhost:3000/text', wait_until='networkidle')
    page.wait_for_selector('.dd-snaplink', timeout=30000)

    settings_buttons = page.locator('button').filter(has_text='设置')
    visible_settings = None
    for index in range(settings_buttons.count()):
        candidate = settings_buttons.nth(index)
        if candidate.is_visible():
            visible_settings = candidate
            break
    if visible_settings is None:
        raise AssertionError('移动端没有找到可见的“设置”按钮')
    visible_settings.click()
    page.wait_for_selector('text=外观模式', timeout=30000)
    page.screenshot(path=str(out_dir / 'dd-settings-theme-mode-mobile.png'), full_page=True)

    info = page.evaluate("""
    () => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      modeButtons: Array.from(document.querySelectorAll('.dd-snaplink__settings-mode-option')).map((item) => {
        const rect = item.getBoundingClientRect()
        return { text: item.textContent.trim(), left: rect.left, right: rect.right, width: rect.width }
      }),
      viewportWidth: window.innerWidth,
    })
    """)
    browser.close()

print(info)
if info['overflowX']:
    raise AssertionError(f'移动端设置页存在横向溢出: {info}')
if len(info['modeButtons']) != 3:
    raise AssertionError(f'移动端外观按钮数量不正确: {info}')
for item in info['modeButtons']:
    if item['left'] < -0.5 or item['right'] > info['viewportWidth'] + 0.5:
        raise AssertionError(f'外观按钮超出视口: {item}, viewport={info["viewportWidth"]}')
