from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1366,'height':900})
    page.goto('http://localhost:3000/web-command', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-web-command', timeout=30000)
    page.wait_for_timeout(1200)
    page.locator('.dd-web-command__head-actions').get_by_role('button', name='运行').click()
    try:
        page.locator('.dd-web-command__result').filter(has_text='answer = 42').first.wait_for(timeout=10000)
        output_seen = True
    except PlaywrightTimeoutError:
        output_seen = False
    page.wait_for_timeout(300)
    print({
        'output_seen': output_seen,
        'status_strip': page.locator('.dd-web-command__status-strip').inner_text(timeout=5000),
        'run_state': page.locator('.dd-web-command__run-state').inner_text(timeout=5000),
        'result_text': page.locator('.dd-web-command__result-area').inner_text(timeout=5000) if page.locator('.dd-web-command__result-area').count() else '',
    })
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-command-run-after-safety.png', full_page=True)
    browser.close()
