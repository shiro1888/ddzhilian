from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1366,'height':900})
    page.goto('http://localhost:3000/chat', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-ai-chat__control-strip', timeout=30000)
    page.wait_for_timeout(1200)
    before = page.locator('.dd-ai-chat__search-pill').inner_text(timeout=5000)
    page.locator('.dd-ai-chat__search-pill').click()
    page.wait_for_timeout(400)
    after = page.locator('.dd-ai-chat__search-pill').inner_text(timeout=5000)
    context = page.locator('.dd-ai-chat__context').inner_text(timeout=5000) if page.locator('.dd-ai-chat__context').count() else ''
    print({'before': before, 'after': after, 'context_has_on': '联网搜索\n开启' in context or '联网搜索 开启' in context, 'context_sample': context[:300]})
    browser.close()
