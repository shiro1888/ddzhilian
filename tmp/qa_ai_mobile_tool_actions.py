from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:3000/chat', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-ai-chat', timeout=30000)
    page.wait_for_timeout(1600)
    action_buttons = page.locator('.dd-snaplink__tool-mobile-actions button')
    labels = [text.strip() for text in action_buttons.all_inner_texts() if text.strip()]
    target = action_buttons.filter(has_text='分析最近传输')
    if target.count() == 0:
        target = action_buttons.filter(has_text='生成传输说明')
    target_label = target.first.inner_text(timeout=5000) if target.count() else ''
    if target.count():
        target.first.click()
        page.wait_for_timeout(500)
    textarea = page.locator('.dd-ai-chat__composer textarea')
    draft = textarea.input_value(timeout=5000) if textarea.count() else ''
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-mobile-tool-actions.png', full_page=True)
    print({
        'labels': labels,
        'target_label': target_label,
        'draft_has_ddzhilian': 'DD直连' in draft,
        'draft_has_sections': '发送前检查' in draft or '文件概览' in draft,
        'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
        'scroll_width': page.evaluate('() => document.documentElement.scrollWidth'),
    })
    browser.close()
