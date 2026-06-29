from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:3000/web-command', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-web-command', timeout=30000)
    page.wait_for_timeout(1200)
    page.locator('.dd-web-command__head-actions').get_by_role('button', name='运行').click()
    try:
        page.locator('text=answer = 42').first.wait_for(timeout=10000)
        output_seen = True
    except PlaywrightTimeoutError:
        output_seen = False
    page.wait_for_timeout(500)
    overflow_before = page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    # central output button should exist after run; on mobile it may be inside output panel, switch if needed
    page.get_by_role('button', name='输出').click()
    page.wait_for_timeout(200)
    share_buttons = page.get_by_role('button', name='发送结果')
    count = share_buttons.count()
    if count:
        share_buttons.first.click()
        page.wait_for_timeout(800)
    text_area = page.locator('.dd-snaplink__text-send-input textarea')
    draft = text_area.input_value(timeout=5000) if text_area.count() else ''
    overflow_after = page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-command-share-result-mobile.png', full_page=True)
    print({
        'output_seen': output_seen,
        'share_button_count': count,
        'overflow_before': overflow_before,
        'overflow_after': overflow_after,
        'url_after_share': page.url,
        'draft_has_answer': 'answer = 42' in draft,
    })
    browser.close()
