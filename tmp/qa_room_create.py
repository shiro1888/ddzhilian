from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

result = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 860})
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(500)
    result['room_page_seen'] = '房间' in page.locator('body').inner_text(timeout=5000)
    before = page.locator('.dd-snaplink__workbench-room').count()
    result['room_cards_before'] = before
    page.get_by_role('button', name='创建房间').first.click()
    page.wait_for_timeout(2500)
    body = page.locator('body').inner_text(timeout=5000)
    result['body_keywords'] = [kw for kw in ['房间', '公共房间', '发送文本', '拖文件到此发送', '成员', '创建房间'] if kw in body]
    result['room_cards_after'] = page.locator('.dd-snaplink__workbench-room').count()
    result['conversation_seen'] = bool(page.locator('.dd-snaplink__messages').count() and page.locator('.dd-snaplink__compose').count())
    result['url'] = page.url
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-room-create-flow.png', full_page=True)
    browser.close()
print(result)
