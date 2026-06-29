from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\transfer-cancel-before-accept.txt')
TEST_FILE.write_text('cancel before accept test', encoding='utf-8')
result = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    a_ctx = browser.new_context(viewport={'width':1280, 'height':860})
    b_ctx = browser.new_context(viewport={'width':1280, 'height':860})
    a = a_ctx.new_page()
    b = b_ctx.new_page()
    for page in (a, b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(2000)

    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    result.update({'b_name': b_name, 'names': names, 'target_index': target_index})
    if target_index is None:
        raise RuntimeError('target device not found')

    # Trust once for this sender context, so the test focuses on transfer cancel, not trust dialog.
    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=6000)
        a.get_by_role('button', name='信任并继续').click()
    except PlaywrightTimeoutError:
        pass

    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=25000)
    result['receive_dialog_seen_before_cancel'] = True
    a.locator('.dd-snaplink__queue-card[data-transfer-status="ready"]').wait_for(timeout=25000)
    queue_before = a.locator('.dd-snaplink__queue').inner_text(timeout=5000)
    result['a_queue_before_cancel'] = queue_before
    cancel_button = a.locator('.dd-snaplink__queue').get_by_role('button', name='取消')
    result['cancel_button_count'] = cancel_button.count()
    if cancel_button.count() > 0:
        cancel_button.first.click()
        a.wait_for_timeout(1200)
    result['a_queue_after_cancel'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000)
    result['b_dialog_after_cancel'] = b.locator('.dd-snaplink__receive-dialog').count()
    result['b_queue_after_cancel'] = b.locator('.dd-snaplink__queue').inner_text(timeout=5000) if b.locator('.dd-snaplink__queue').count() else ''
    a.screenshot(path=str(OUT / 'dd-transfer-cancel-before-accept-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-transfer-cancel-before-accept-b.png'), full_page=True)
    browser.close()

print(result)
