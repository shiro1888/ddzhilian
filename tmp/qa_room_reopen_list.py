import json
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

result = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 860})
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(400)
    page.get_by_role('button', name='创建房间').first.click()
    page.wait_for_timeout(2000)
    result['after_create_text'] = page.locator('body').inner_text(timeout=5000)[:500]
    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(700)
    result['after_click_room_text'] = page.locator('body').inner_text(timeout=5000)[:800]
    result['has_room_card'] = page.locator('.dd-snaplink__workbench-room').count()
    result['has_create_button'] = page.get_by_role('button', name='创建房间').count()
    result['has_conversation_input'] = page.locator('textarea, [contenteditable="true"]').count()
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-room-click-room-after-conversation.png', full_page=True)
    browser.close()
print(json.dumps(result, ensure_ascii=False))
