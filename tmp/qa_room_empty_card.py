from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1280,'height':860})
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(400)
    page.get_by_role('button', name='创建房间').first.click()
    page.wait_for_timeout(1800)
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(800)
    empty_room = page.locator('.dd-snaplink__workbench-room').filter(has_text='暂无消息').last
    if empty_room.count() > 0:
        empty_room.get_by_role('button').first.click()
        page.wait_for_timeout(1000)
    empty_card = page.locator('.dd-snaplink__room-empty-card')
    empty_seen = empty_card.count() > 0
    text = empty_card.inner_text(timeout=5000) if empty_seen else ''
    focus_ok = False
    if empty_seen:
        empty_card.get_by_role('button', name='发送文本').click()
        page.wait_for_timeout(300)
        focus_ok = page.evaluate("() => document.activeElement?.tagName === 'TEXTAREA'")
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-room-empty-card.png', full_page=True)
    if empty_seen:
        empty_card.get_by_role('button', name='查看附近设备').click()
        page.wait_for_timeout(500)
    body = page.locator('body').inner_text(timeout=5000)
    result = {
        'empty_seen': empty_seen,
        'empty_text': text,
        'focus_ok': focus_ok,
        'after_nearby': '附近设备' in body and '重新扫描' in body,
        'overflow': page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth'),
    }
    print(result)
    browser.close()
    if not (result['empty_seen'] and result['focus_ok'] and result['after_nearby'] and not result['overflow']):
        raise SystemExit(1)
