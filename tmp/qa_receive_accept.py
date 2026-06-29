from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
result = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_a = browser.new_context(viewport={'width':1280,'height':860})
    ctx_b = browser.new_context(viewport={'width':1280,'height':860})
    a = ctx_a.new_page(); b = ctx_b.new_page()
    for page in (a,b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(1500)
    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    a.wait_for_selector('.dd-snaplink__workbench-device', timeout=25000)
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    if target_index is None:
        result['error'] = 'target missing'; result['b_name']=b_name; result['names']=names
        print(result); browser.close(); raise SystemExit(0)
    card = a.locator('.dd-snaplink__workbench-device').nth(target_index)
    dt = a.evaluate_handle("""() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['accept flow test'], 'receive-accept-flow.txt', { type: 'text/plain' }));
      return dataTransfer;
    }""")
    card.dispatch_event('dragenter', {'dataTransfer': dt})
    card.dispatch_event('dragover', {'dataTransfer': dt})
    card.dispatch_event('drop', {'dataTransfer': dt})

    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        result['trust_dialog_seen_on_a'] = True
        result['b_offer_before_trust_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()
        a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        result['trust_dialog_seen_on_a'] = False
        result['b_offer_before_trust_confirm'] = b.locator('.dd-snaplink__receive-dialog').count()

    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=45000)
    result['receive_dialog_seen_on_b'] = True
    b.get_by_role('button', name='接收文件').click()
    # Small file should complete very quickly after receiver sends file-resume.
    try:
        a.locator('.dd-snaplink__queue-card[data-transfer-status="completed"][data-transfer-direction="outgoing"]').wait_for(timeout=45000)
        result['a_completed'] = True
    except PlaywrightTimeoutError:
        result['a_completed'] = False
    try:
        b.locator('.dd-snaplink__queue-card[data-transfer-status="completed"][data-transfer-direction="incoming"]').wait_for(timeout=5000)
        result['b_completion_label_seen'] = True
    except Exception:
        result['b_completion_label_seen'] = False
    result['a_queue_text'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if a.locator('.dd-snaplink__queue').count() else ''
    result['b_queue_text'] = b.locator('.dd-snaplink__queue').inner_text(timeout=5000) if b.locator('.dd-snaplink__queue').count() else ''
    a.screenshot(path=str(OUT / 'dd-receive-accept-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-receive-accept-b.png'), full_page=True)
    browser.close()
print(result)
failures = []
if not result.get('receive_dialog_seen_on_b'):
    failures.append('receiver confirmation dialog did not appear')
if result.get('b_offer_before_trust_confirm') not in (0, None):
    failures.append('receiver saw offer before sender trust confirmation')
if not result.get('a_completed'):
    failures.append('sender queue did not complete')
if not result.get('b_completion_label_seen'):
    failures.append('receiver queue did not complete')
if failures:
    raise SystemExit({'failures': failures, **result})
