from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for name, viewport, is_mobile in [('desktop', {'width':1366,'height':900}, False), ('mobile', {'width':375,'height':812}, True)]:
        page = browser.new_page(viewport=viewport, is_mobile=is_mobile)
        page.goto('http://localhost:3000/chat', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-ai-chat', timeout=30000)
        page.wait_for_timeout(1600)
        result = {
            'name': name,
            'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
            'scrollWidth': page.evaluate('() => document.documentElement.scrollWidth'),
            'controlStrip': page.locator('.dd-ai-chat__control-strip').count(),
            'modelPillText': page.locator('.dd-ai-chat__model-pill').first.inner_text(timeout=5000) if page.locator('.dd-ai-chat__model-pill').count() else '',
            'searchPillText': page.locator('.dd-ai-chat__search-pill').first.inner_text(timeout=5000) if page.locator('.dd-ai-chat__search-pill').count() else '',
            'contextPillVisible': page.locator('.dd-ai-chat__context-pill').first.is_visible() if page.locator('.dd-ai-chat__context-pill').count() else False,
        }
        print(result)
        page.screenshot(path=f'C:/Project/ddzhilian/output/chrome-qa/dd-chat-toolbar-{name}.png', full_page=True)
        page.close()
    browser.close()
