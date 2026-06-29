from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\trust-persist-send.txt')
TEST_FILE.write_text('trust persist send test', encoding='utf-8')
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

    # First attempt should show trust dialog.
    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=10000)
    result['first_trust_dialog'] = True
    # Default remember checkbox is on; click primary confirm.
    a.get_by_role('button', name='信任并继续').click()
    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=20000)
    b.get_by_role('button', name='拒绝').click()
    a.locator('.dd-snaplink__queue-card[data-transfer-status="failed"][data-transfer-direction="outgoing"]').wait_for(timeout=20000)

    trusted_storage = a.evaluate("() => window.localStorage.getItem('ddzhilian:trusted-devices:v1')")
    result['trusted_storage_after_confirm'] = trusted_storage

    # Reload sender and verify the device card now shows trusted state.
    a.reload(wait_until='domcontentloaded')
    a.wait_for_selector('.dd-snaplink__app', timeout=30000)
    a.wait_for_timeout(2200)
    names_after = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index_after = next((i for i, name in enumerate(names_after) if name.strip() == b_name.strip()), None)
    result['target_index_after_reload'] = target_index_after
    if target_index_after is not None:
        card_text = a.locator('.dd-snaplink__workbench-device').nth(target_index_after).inner_text(timeout=5000)
        result['card_text_after_reload'] = card_text
        result['card_shows_trusted'] = '已信任' in card_text
        a.locator('.dd-snaplink__workbench-device-main').nth(target_index_after).click()
        a.wait_for_timeout(500)
        a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
        a.wait_for_timeout(1800)
        result['second_trust_dialog_count'] = a.locator('.dd-snaplink__trust-dialog').count()
        result['receive_dialog_after_second_send'] = b.locator('.dd-snaplink__receive-dialog').count()
    a.screenshot(path=str(OUT / 'dd-trust-persist-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-trust-persist-b.png'), full_page=True)
    browser.close()

print(result)
