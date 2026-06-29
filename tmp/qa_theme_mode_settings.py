from pathlib import Path
from playwright.sync_api import sync_playwright

out_dir = Path('output/chrome-qa')
out_dir.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    page.goto('http://localhost:3000/text', wait_until='networkidle')
    page.wait_for_selector('.dd-snaplink', timeout=30000)

    settings_buttons = page.locator('button').filter(has_text='设置')
    count = settings_buttons.count()
    if count == 0:
        raise AssertionError('没有找到“设置”按钮')
    settings_buttons.first.click()
    page.wait_for_selector('text=外观模式', timeout=30000)

    dark_button = page.locator('.dd-snaplink__settings-mode-option').filter(has_text='深色')
    if dark_button.count() == 0:
        raise AssertionError('没有找到“深色”外观按钮')
    dark_button.first.click()
    page.wait_for_timeout(300)

    dark_info = page.evaluate("""
    () => {
      const stage = document.querySelector('.dd-snaplink')
      const styles = stage ? getComputedStyle(stage) : null
      return {
        mode: document.documentElement.getAttribute('data-theme-mode'),
        dark: document.documentElement.classList.contains('dark'),
        colorScheme: document.documentElement.style.colorScheme,
        snapBg: styles ? styles.getPropertyValue('--snap-bg').trim() : '',
        snapSurface: styles ? styles.getPropertyValue('--snap-surface').trim() : '',
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        note: document.querySelector('.dd-snaplink__settings-mode-note')?.textContent?.trim() || '',
      }
    }
    """)
    page.screenshot(path=str(out_dir / 'dd-settings-theme-mode-dark.png'), full_page=True)

    light_button = page.locator('.dd-snaplink__settings-mode-option').filter(has_text='浅色')
    light_button.first.click()
    page.wait_for_timeout(300)

    light_info = page.evaluate("""
    () => {
      const stage = document.querySelector('.dd-snaplink')
      const styles = stage ? getComputedStyle(stage) : null
      return {
        mode: document.documentElement.getAttribute('data-theme-mode'),
        dark: document.documentElement.classList.contains('dark'),
        colorScheme: document.documentElement.style.colorScheme,
        snapBg: styles ? styles.getPropertyValue('--snap-bg').trim() : '',
        snapSurface: styles ? styles.getPropertyValue('--snap-surface').trim() : '',
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        note: document.querySelector('.dd-snaplink__settings-mode-note')?.textContent?.trim() || '',
      }
    }
    """)
    page.screenshot(path=str(out_dir / 'dd-settings-theme-mode-light.png'), full_page=True)
    browser.close()

print('DARK', dark_info)
print('LIGHT', light_info)

if dark_info['mode'] != 'dark' or not dark_info['dark'] or dark_info['snapBg'] != '#1b1b1d':
    raise AssertionError(f'深色模式未正确生效: {dark_info}')
if light_info['mode'] != 'light' or light_info['dark'] or light_info['snapBg'] != '#f5f5f5':
    raise AssertionError(f'浅色模式未正确恢复: {light_info}')
if dark_info['overflowX'] or light_info['overflowX']:
    raise AssertionError(f'页面存在横向溢出: dark={dark_info}, light={light_info}')
