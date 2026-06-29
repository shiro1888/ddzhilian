from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\trust-pin-validation.txt')
TEST_FILE.write_text('trust pin validation', encoding='utf-8')
result: dict[str, Any] = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    a_ctx = browser.new_context(viewport={'width': 1280, 'height': 860})
    b_ctx = browser.new_context(viewport={'width': 1280, 'height': 860})
    a = a_ctx.new_page()
    b = b_ctx.new_page()
    for page in (a, b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(2000)

    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    b_short_code = b.locator('.dd-snaplink__workbench-status').evaluate("""el => {
      const text = el.innerText || '';
      return text.match(/[A-Z0-9]{4,8}/)?.[0] || '';
    }""")
    # The target device card exposes the sender-visible short code in the trust dialog.
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    result.update({'b_name': b_name, 'names': names, 'target_index': target_index})
    if target_index is None:
        raise RuntimeError('target device not found')

    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=10000)
    result['trust_dialog_seen'] = True
    dialog_text = a.locator('.dd-snaplink__trust-dialog').inner_text(timeout=5000)
    result['dialog_has_pin_copy'] = 'PIN / 短码校验' in dialog_text and '指纹' in dialog_text and '短码' in dialog_text
    result['b_offer_before_pin'] = b.locator('.dd-snaplink__receive-dialog').count()

    pin_input = a.locator('.dd-snaplink__trust-dialog-pin input').first
    pin_input.fill('WRONG1')
    a.get_by_role('button', name='信任并继续').click()
    a.wait_for_selector('.dd-snaplink__trust-dialog-error', timeout=5000)
    result['invalid_pin_error'] = a.locator('.dd-snaplink__trust-dialog-error').inner_text(timeout=5000)
    result['dialog_still_open_after_invalid_pin'] = a.locator('.dd-snaplink__trust-dialog').count() == 1
    result['b_offer_after_invalid_pin'] = b.locator('.dd-snaplink__receive-dialog').count()

    expected_pin = a.locator('.dd-snaplink__trust-dialog-codes span').filter(has_text='短码').locator('strong').first.inner_text(timeout=5000).strip()
    result['expected_pin_from_dialog'] = expected_pin
    pin_input.fill(expected_pin)
    a.get_by_role('button', name='信任并继续').click()
    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=20000)
    result['b_offer_after_valid_pin'] = b.locator('.dd-snaplink__receive-dialog').count()
    storage_after_trust = a.evaluate("() => window.localStorage.getItem('ddzhilian:trusted-devices:v1')")
    result['trusted_storage_after_valid_pin'] = storage_after_trust
    b.get_by_role('button', name='拒绝').click()
    a.locator('.dd-snaplink__queue-card[data-transfer-status="failed"][data-transfer-direction="outgoing"]').wait_for(timeout=20000)

    # Reload and send again; trusted devices should skip the trust dialog and show trusted badge.
    a.reload(wait_until='domcontentloaded')
    a.wait_for_selector('.dd-snaplink__app', timeout=30000)
    a.wait_for_timeout(2200)
    names_after = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index_after = next((i for i, name in enumerate(names_after) if name.strip() == b_name.strip()), None)
    result['target_index_after_reload'] = target_index_after
    if target_index_after is None:
        raise RuntimeError('target missing after reload')
    card_text = a.locator('.dd-snaplink__workbench-device').nth(target_index_after).inner_text(timeout=5000)
    result['card_shows_trusted_after_reload'] = '已信任' in card_text
    a.locator('.dd-snaplink__workbench-device-main').nth(target_index_after).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    a.wait_for_timeout(1600)
    result['second_trust_dialog_count'] = a.locator('.dd-snaplink__trust-dialog').count()
    result['second_receive_dialog_count'] = b.locator('.dd-snaplink__receive-dialog').count()

    a.screenshot(path=str(OUT / 'trust-pin-validation-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'trust-pin-validation-b.png'), full_page=True)
    browser.close()

print(json.dumps(result, ensure_ascii=False, indent=2))
required = [
    result.get('trust_dialog_seen') is True,
    result.get('dialog_has_pin_copy') is True,
    result.get('b_offer_before_pin') == 0,
    '短码不一致' in result.get('invalid_pin_error', ''),
    result.get('dialog_still_open_after_invalid_pin') is True,
    result.get('b_offer_after_invalid_pin') == 0,
    result.get('b_offer_after_valid_pin') == 1,
    bool(result.get('trusted_storage_after_valid_pin')),
    result.get('card_shows_trusted_after_reload') is True,
    result.get('second_trust_dialog_count') == 0,
    result.get('second_receive_dialog_count') == 1,
]
if not all(required):
    raise SystemExit(1)
