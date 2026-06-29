from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for name, viewport, is_mobile in [('desktop', {'width':1366,'height':900}, False), ('mobile', {'width':375,'height':812}, True)]:
        page = browser.new_page(viewport=viewport, is_mobile=is_mobile)
        page.goto('http://localhost:3000/web-command', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-web-command', timeout=30000)
        page.wait_for_timeout(1600)
        safety = page.locator('.dd-web-command__safety-strip')
        status = page.locator('.dd-web-command__status-strip')
        results.append({
            'name': name,
            'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
            'scrollWidth': page.evaluate('() => document.documentElement.scrollWidth'),
            'safety_count': safety.count(),
            'safety_text': safety.inner_text(timeout=5000) if safety.count() else '',
            'status_text': status.inner_text(timeout=5000) if status.count() else '',
            'run_button_count': page.get_by_role('button', name='运行').count(),
        })
        page.screenshot(path=f'C:/Project/ddzhilian/output/chrome-qa/dd-command-safety-{name}.png', full_page=True)
        page.close()
    browser.close()
print(results)
