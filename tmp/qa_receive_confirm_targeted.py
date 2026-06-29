from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
result = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_a = browser.new_context(viewport={'width':1280,'height':860})
    ctx_b = browser.new_context(viewport={'width':1280,'height':860})
    a = ctx_a.new_page()
    b = ctx_b.new_page()
    for page in (a,b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(1500)
    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong, .dd-snaplink__room-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    a.wait_for_selector('.dd-snaplink__workbench-device', timeout=25000)
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    result['b_name'] = b_name
    result['a_device_names'] = names
    result['target_index'] = target_index
    if target_index is None:
        a.screenshot(path=str(OUT / 'dd-receive-confirm-target-missing-a.png'), full_page=True)
        b.screenshot(path=str(OUT / 'dd-receive-confirm-target-missing-b.png'), full_page=True)
        browser.close()
        print(result)
        raise SystemExit(0)

    card = a.locator('.dd-snaplink__workbench-device').nth(target_index)
    dt = a.evaluate_handle("""() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['receive dialog test'], 'receive-confirm-targeted.txt', { type: 'text/plain' }));
      return dataTransfer;
    }""")
    card.dispatch_event('dragenter', {'dataTransfer': dt})
    card.dispatch_event('dragover', {'dataTransfer': dt})
    card.dispatch_event('drop', {'dataTransfer': dt})
    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        result['trust_dialog_seen_on_a'] = True
        a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        result['trust_dialog_seen_on_a'] = False
    dialog_seen = False
    try:
        b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=45000)
        dialog_seen = True
    except PlaywrightTimeoutError:
        pass
    result['dialog_seen_on_b'] = dialog_seen
    result['a_queue_text'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if a.locator('.dd-snaplink__queue').count() else ''
    result['b_dialog_text'] = b.locator('.dd-snaplink__receive-dialog').inner_text(timeout=5000) if dialog_seen else ''
    result['b_notice_text'] = b.locator('.dd-snaplink__receive-notice').inner_text(timeout=5000) if b.locator('.dd-snaplink__receive-notice').count() else ''
    a.screenshot(path=str(OUT / 'dd-receive-confirm-targeted-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-receive-confirm-targeted-b.png'), full_page=True)
    browser.close()
    if not dialog_seen:
        raise SystemExit(1)
print(result)

