from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1280,'height':860})
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='设置').first.click()
    page.wait_for_timeout(600)

    page.get_by_role('button', name='保存设备名').click()
    page.wait_for_timeout(250)
    save_feedback = page.locator('.dd-snaplink__settings-feedback').inner_text(timeout=5000) if page.locator('.dd-snaplink__settings-feedback').count() else ''

    switch = page.get_by_role('switch', name='回车发送 开启后 Enter 发送，Shift + Enter 换行').first
    before = switch.get_attribute('aria-checked')
    switch.click()
    page.wait_for_timeout(250)
    toggle_feedback = page.locator('.dd-snaplink__settings-feedback').inner_text(timeout=5000) if page.locator('.dd-snaplink__settings-feedback').count() else ''
    switch.click()
    page.wait_for_timeout(250)
    restored = switch.get_attribute('aria-checked') == before

    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-settings-feedback.png', full_page=True)
    print({
        'save_feedback': save_feedback,
        'toggle_feedback': toggle_feedback,
        'restored': restored,
        'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
    })
    browser.close()
