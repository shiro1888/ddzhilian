from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\trust-accept-complete.txt')
TEST_FILE.write_text('trust then accept complete', encoding='utf-8')
result = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    a = browser.new_context(viewport={'width':1280, 'height':860}).new_page()
    b = browser.new_context(viewport={'width':1280, 'height':860}).new_page()
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

    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
    result['trust_dialog_seen_on_a'] = True
    result['b_offer_before_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()
    a.get_by_role('button', name='仅本次继续').click()
    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=20000)
    result['receive_dialog_seen_on_b'] = True
    b.get_by_role('button', name='接收文件').click()

    try:
        a.locator('.dd-snaplink__queue-card[data-transfer-status="completed"][data-transfer-direction="outgoing"]').wait_for(timeout=45000)
        result['a_completed'] = True
    except PlaywrightTimeoutError:
        result['a_completed'] = False
    result['a_queue_text'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000)
    result['b_queue_text'] = b.locator('.dd-snaplink__queue').inner_text(timeout=5000)
    a.screenshot(path=str(OUT / 'dd-trust-accept-complete-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-trust-accept-complete-b.png'), full_page=True)
    browser.close()

print(result)
