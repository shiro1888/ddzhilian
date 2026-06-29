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
        page.wait_for_timeout(2500)
    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    a.wait_for_selector('.dd-snaplink__workbench-device', timeout=25000)
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    result.update({'b_name': b_name, 'names': names, 'target_index': target_index})
    if target_index is not None:
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
            b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=60000)
            result['dialog_seen'] = True
        except PlaywrightTimeoutError:
            result['dialog_seen'] = False
        result['a_queue'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if a.locator('.dd-snaplink__queue').count() else ''
        result['b_queue'] = b.locator('.dd-snaplink__queue').inner_text(timeout=5000) if b.locator('.dd-snaplink__queue').count() else ''
        result['b_dialog'] = b.locator('.dd-snaplink__receive-dialog').inner_text(timeout=5000) if result['dialog_seen'] else ''
    a.screenshot(path=str(OUT / 'dd-receive-accept-debug-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-receive-accept-debug-b.png'), full_page=True)
    browser.close()
print(result)
