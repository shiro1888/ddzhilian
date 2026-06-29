from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\trust-before-send.txt')
TEST_FILE.write_text('trust gate before direct send', encoding='utf-8')
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

    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))

    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        result['trust_dialog_seen_on_a'] = True
    except PlaywrightTimeoutError:
        result['trust_dialog_seen_on_a'] = False

    result['b_offer_before_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()
    b.wait_for_timeout(1500)
    result['b_offer_before_wait'] = b.locator('.dd-snaplink__receive-dialog').count()

    if result['trust_dialog_seen_on_a']:
        a.get_by_role('button', name='仅本次继续').click()
        b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=20000)
        result['b_offer_after_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()
        b.get_by_role('button', name='拒绝').click()
        a.locator('.dd-snaplink__queue-card[data-transfer-status="failed"][data-transfer-direction="outgoing"]').wait_for(timeout=20000)
        result['a_failed_after_reject'] = True
        result['a_queue_text'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000)
    else:
        result['b_offer_after_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()

    a.screenshot(path=str(OUT / 'dd-trust-before-send-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-trust-before-send-b.png'), full_page=True)
    browser.close()

print(result)
failures = []
if not result.get('trust_dialog_seen_on_a'):
    failures.append('sender trust dialog did not appear before first send')
if result.get('b_offer_before_confirm') != 0:
    failures.append('receiver offer appeared before sender confirmed trust')
if result.get('b_offer_before_wait') != 0:
    failures.append('receiver offer appeared while sender trust dialog was still open')
if result.get('b_offer_after_confirm') != 1:
    failures.append('receiver offer did not appear after sender trust confirmation')
if result.get('a_failed_after_reject') is not True:
    failures.append('sender queue did not fail after receiver rejected')
if failures:
    raise SystemExit({'failures': failures, **result})
