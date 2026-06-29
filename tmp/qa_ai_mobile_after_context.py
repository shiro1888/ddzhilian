from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:3000/chat', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-ai-chat', timeout=30000)
    page.wait_for_timeout(1600)
    # Mobile hides the right tool panel, so verify the AI page itself remains usable after the new props.
    textarea = page.locator('.dd-ai-chat__composer textarea')
    textarea.fill('移动端 AI 输入验证')
    page.wait_for_timeout(300)
    draft = textarea.input_value(timeout=5000)
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-mobile-after-context-prop.png', full_page=True)
    print({
        'draft_ok': draft == '移动端 AI 输入验证',
        'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
        'buttons': [b.strip() for b in page.locator('button').all_inner_texts() if b.strip()][:24],
    })
    browser.close()
