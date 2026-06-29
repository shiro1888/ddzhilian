from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 900})
    page.goto('http://localhost:3000/web-command', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-web-command', timeout=30000)
    page.wait_for_timeout(1200)

    side_button = page.locator('.dd-snaplink__tool-side-actions').get_by_role('button', name='运行后发送结果')
    disabled_before = side_button.is_disabled()

    page.locator('.dd-web-command__head-actions').get_by_role('button', name='运行').click()
    try:
        page.locator('text=answer = 42').first.wait_for(timeout=10000)
        output_seen = True
    except PlaywrightTimeoutError:
        output_seen = False

    page.wait_for_timeout(600)
    share_button = page.locator('.dd-snaplink__tool-side-actions').get_by_role('button', name='发送运行结果')
    enabled_after = share_button.count() == 1 and not share_button.is_disabled()
    share_button.click()
    page.wait_for_timeout(800)

    text_area = page.locator('.dd-snaplink__text-send-input textarea')
    draft = text_area.input_value(timeout=5000) if text_area.count() else ''
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-command-share-result-text.png', full_page=True)

    print({
        'disabled_before': disabled_before,
        'output_seen': output_seen,
        'enabled_after': enabled_after,
        'url_after_share': page.url,
        'draft_has_result_title': '命令运行结果' in draft,
        'draft_has_answer': 'answer = 42' in draft,
        'draft_preview': draft[:120],
    })
    browser.close()
