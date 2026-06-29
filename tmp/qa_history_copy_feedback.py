from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1280,'height':860})
    try:
        context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:3000')
    except Exception:
        pass
    page = context.new_page()
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1400)
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(400)
    page.get_by_role('button', name='创建房间').first.click()
    page.wait_for_timeout(1600)
    text = '历史复制验证 history copy qa'
    textarea = page.locator('textarea').last
    textarea.fill(text)
    page.wait_for_timeout(200)
    page.locator('.dd-snaplink__send').click()
    try:
        page.locator('.dd-snaplink__bubble').filter(has_text=text).first.wait_for(timeout=8000)
        sent = True
    except PlaywrightTimeoutError:
        sent = False
    page.get_by_role('button', name='历史').first.click()
    page.wait_for_timeout(900)
    history_seen = page.get_by_text('历史复制验证').count() > 0
    copied_label = False
    if history_seen:
        row = page.locator('.dd-snaplink__text-history-row').filter(has_text='历史复制验证').first
        row.get_by_role('button', name='复制').click()
        page.wait_for_timeout(250)
        copied_label = row.get_by_role('button', name='已复制').count() > 0
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-history-copy-feedback.png', full_page=True)
    result = {
        'sent': sent,
        'history_seen': history_seen,
        'copied_label': copied_label,
        'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
    }
    print(result)
    browser.close()
    if not (result['sent'] and result['history_seen'] and result['copied_label'] and not result['overflow']):
        raise SystemExit(1)
