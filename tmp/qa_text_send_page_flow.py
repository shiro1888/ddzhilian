from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEXT = '文本发送页专项 QA text-send-page-flow'
result = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 860})
    try:
        context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:3000')
    except Exception:
        pass
    page = context.new_page()
    page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)

    page.get_by_role('button', name='房间').first.click()
    page.wait_for_timeout(400)
    page.get_by_role('button', name='创建房间').first.click()
    page.wait_for_timeout(1800)
    result['room_opened'] = page.locator('.dd-snaplink__room').count() > 0

    page.get_by_role('button', name='文本').first.click()
    page.wait_for_timeout(700)
    result['text_page_seen'] = page.locator('.dd-snaplink__workbench-page.is-text').count() > 0
    result['target_summary'] = page.locator('.dd-snaplink__target-summary').inner_text(timeout=5000) if page.locator('.dd-snaplink__target-summary').count() else ''

    textarea = page.locator('.dd-snaplink__workbench-page.is-text textarea').first
    textarea.fill(TEXT)
    page.locator('.dd-snaplink__workbench-page.is-text .dd-snaplink__text-send-footer button[type="submit"]').click()
    try:
        page.locator('.dd-snaplink__text-history-row').filter(has_text=TEXT).first.wait_for(timeout=8000)
        result['history_row_seen_in_text_page'] = True
    except PlaywrightTimeoutError:
        result['history_row_seen_in_text_page'] = False

    page.get_by_role('button', name='历史').first.click()
    page.wait_for_timeout(900)
    row = page.locator('.dd-snaplink__text-history-row').filter(has_text=TEXT).first
    result['history_page_row_seen'] = row.count() > 0
    copied_label = False
    if result['history_page_row_seen']:
        row.get_by_role('button', name='复制').click()
        page.wait_for_timeout(250)
        copied_label = row.get_by_role('button', name='已复制').count() > 0
    result['copied_label'] = copied_label
    result['overflow'] = page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    page.screenshot(path=str(OUT / 'dd-text-send-page-flow.png'), full_page=True)
    browser.close()

print(result)
if not (result['room_opened'] and result['text_page_seen'] and result['history_row_seen_in_text_page'] and result['history_page_row_seen'] and result['copied_label'] and not result['overflow']):
    raise SystemExit(1)
