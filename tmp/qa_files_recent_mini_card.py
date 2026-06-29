from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

sample = Path('C:/Project/ddzhilian/tmp/recent-mini-card.txt')
sample.write_text('recent mini card qa', encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    a = browser.new_context(viewport={'width': 1280, 'height': 860}).new_page()
    b = browser.new_context(viewport={'width': 1280, 'height': 860}).new_page()
    for page in (a, b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(2000)

    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000).strip()
    names = [name.strip() for name in a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()]
    target_index = next((i for i, name in enumerate(names) if name == b_name), None)
    if target_index is None:
        raise RuntimeError({'b_name': b_name, 'names': names})

    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(sample))
    a.wait_for_timeout(500)
    if a.locator('.dd-snaplink__trust-dialog').count():
        a.get_by_role('button', name='仅本次继续').click()
    b.locator('.dd-snaplink__receive-dialog').wait_for(timeout=20000)
    b.get_by_role('button', name='接收文件').click()
    a.get_by_text('发送成功', exact=True).first.wait_for(timeout=45000)
    b.get_by_text('已接收', exact=True).first.wait_for(timeout=45000)

    a.get_by_role('button', name='文件').first.click()
    a.wait_for_timeout(800)
    recent = a.locator('.dd-snaplink__recent-send').first
    recent_text = recent.inner_text(timeout=5000) if recent.count() else ''
    action_buttons = recent.locator('.dd-snaplink__file-actions button, .dd-snaplink__file-actions a').all_inner_texts() if recent.count() else []
    progress_count = recent.locator('[role="progressbar"]').count() if recent.count() else 0
    progress_value = recent.locator('[role="progressbar"]').first.get_attribute('aria-valuenow') if progress_count else ''
    overflow = a.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    a.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-files-recent-mini-card.png', full_page=True)

    b.get_by_role('button', name='文件').first.click()
    b.wait_for_timeout(800)
    receiver_recent_count = b.locator('.dd-snaplink__recent-send').count()
    receiver_recent_text = b.locator('.dd-snaplink__recent-send').first.inner_text(timeout=2000) if receiver_recent_count else ''
    receiver_overflow = b.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    b.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-files-recent-mini-card-receiver.png', full_page=True)

    result = {
        'b_name': b_name,
        'recent_text': recent_text,
        'action_buttons': [item.strip() for item in action_buttons if item.strip()],
        'progress_count': progress_count,
        'progress_value': progress_value,
        'overflow': overflow,
        'receiver_recent_count': receiver_recent_count,
        'receiver_recent_text': receiver_recent_text,
        'receiver_overflow': receiver_overflow,
    }
    print(result)
    failures = []
    if not recent_text:
        failures.append('recent send card missing')
    if '发送到' not in recent_text:
        failures.append('recent send card is not an outgoing send')
    if '来自' in recent_text:
        failures.append('incoming receive leaked into recent sends')
    if progress_count != 1:
        failures.append('recent send progressbar missing')
    if progress_value != '100':
        failures.append(f'recent send progress should be 100 after completion, got {progress_value!r}')
    if overflow:
        failures.append('desktop file page has horizontal overflow')
    if receiver_recent_count != 0:
        failures.append('receiver file page should not list received files under recent sends')
    if '来自' in receiver_recent_text:
        failures.append('receiver recent sends contains incoming copy')
    if receiver_overflow:
        failures.append('receiver file page has horizontal overflow')
    if failures:
        raise SystemExit({'failures': failures, **result})
    browser.close()
