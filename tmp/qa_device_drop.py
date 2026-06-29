from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE = 'http://localhost:3000/text'
OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)

def wait_for_app(page):
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_a = browser.new_context(viewport={'width': 1280, 'height': 860})
    ctx_b = browser.new_context(viewport={'width': 1280, 'height': 860})
    page_a = ctx_a.new_page()
    page_b = ctx_b.new_page()
    console_errors = []
    page_a.on('console', lambda msg: console_errors.append(f'A console {msg.type}: {msg.text}') if msg.type in ['error'] else None)
    page_b.on('console', lambda msg: console_errors.append(f'B console {msg.type}: {msg.text}') if msg.type in ['error'] else None)

    wait_for_app(page_a)
    wait_for_app(page_b)

    # Give the signaling layer time to publish both devices.
    try:
        page_a.wait_for_selector('.dd-snaplink__workbench-device', timeout=20000)
    except PlaywrightTimeoutError:
        page_a.screenshot(path=str(OUT / 'dd-device-drop-no-peer-a.png'), full_page=True)
        page_b.screenshot(path=str(OUT / 'dd-device-drop-no-peer-b.png'), full_page=True)
        print({'ok': False, 'reason': 'no peer device card discovered', 'console_errors': console_errors})
        browser.close()
        raise SystemExit(1)

    card = page_a.locator('.dd-snaplink__workbench-device').first
    before = {
        'cards': page_a.locator('.dd-snaplink__workbench-device').count(),
        'queue_cards': page_a.locator('.dd-snaplink__queue-card').count(),
        'mode_files': page_a.locator('.dd-snaplink__workbench-page.is-files').count(),
        'room_view': page_a.locator('.dd-snaplink__room-view').count(),
    }

    dt = page_a.evaluate_handle("""() => {
      const dataTransfer = new DataTransfer();
      const file = new File(['hello from playwright'], 'device-drop-test.txt', { type: 'text/plain' });
      dataTransfer.items.add(file);
      return dataTransfer;
    }""")
    card.dispatch_event('dragenter', {'dataTransfer': dt})
    page_a.wait_for_timeout(150)
    highlighted = card.evaluate("el => el.classList.contains('is-drop-target')")
    card.dispatch_event('dragover', {'dataTransfer': dt})
    card.dispatch_event('drop', {'dataTransfer': dt})
    page_a.wait_for_timeout(500)
    try:
        page_a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        trust_dialog_seen = True
        page_a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        trust_dialog_seen = False
    try:
        page_b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=20000)
        receive_dialog_seen = True
        page_b.get_by_role('button', name='拒绝').click()
    except PlaywrightTimeoutError:
        receive_dialog_seen = False
    page_a.wait_for_timeout(1000)

    after = {
        'cards': page_a.locator('.dd-snaplink__workbench-device').count(),
        'queue_cards': page_a.locator('.dd-snaplink__queue-card').count(),
        'mode_files': page_a.locator('.dd-snaplink__workbench-page.is-files').count(),
        'room_view': page_a.locator('.dd-snaplink__room-view').count(),
        'drag_overlay': page_a.locator('.dd-snaplink__drag-overlay').count(),
        'highlighted_after': page_a.locator('.dd-snaplink__workbench-device.is-drop-target').count(),
        'has_test_file_text': page_a.get_by_text('device-drop-test.txt').count(),
        'queue_text': page_a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if page_a.locator('.dd-snaplink__queue').count() else '',
    }

    page_a.screenshot(path=str(OUT / 'dd-device-drop-verified-a.png'), full_page=True)
    page_b.screenshot(path=str(OUT / 'dd-device-drop-verified-b.png'), full_page=True)
    ok = (
        after['queue_cards'] >= before['queue_cards'] + 1
        and highlighted
        and after['drag_overlay'] == 0
        and after['has_test_file_text'] >= 1
        and trust_dialog_seen
        and receive_dialog_seen
    )
    print({
        'ok': ok,
        'highlighted': highlighted,
        'trust_dialog_seen': trust_dialog_seen,
        'receive_dialog_seen': receive_dialog_seen,
        'before': before,
        'after': after,
        'console_errors': console_errors,
    })
    browser.close()
    if not ok:
        raise SystemExit(1)
