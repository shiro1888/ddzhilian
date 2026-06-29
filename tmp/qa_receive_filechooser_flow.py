from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\receive-filechooser-flow.txt')
TEST_FILE.write_text('file chooser receive confirm test', encoding='utf-8')
result = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_a = browser.new_context(viewport={'width':1280,'height':860})
    ctx_b = browser.new_context(viewport={'width':1280,'height':860})
    a = ctx_a.new_page(); b = ctx_b.new_page()
    for page in (a,b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(1800)
    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    a.wait_for_selector('.dd-snaplink__workbench-device', timeout=25000)
    names = a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index = next((i for i, name in enumerate(names) if name.strip() == b_name.strip()), None)
    result.update({'b_name': b_name, 'names': names, 'target_index': target_index})
    if target_index is None:
        print(result); browser.close(); raise SystemExit(0)
    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(300)
    a.locator('.dd-snaplink__rail button:has-text("文件")').first.click()
    a.wait_for_timeout(300)
    choose_button = a.locator('.dd-snaplink__workbench-page.is-files button:has-text("选择文件")').first
    try:
        with a.expect_file_chooser(timeout=3000) as fc_info:
            choose_button.click()
        fc_info.value.set_files(str(TEST_FILE))
        result['filechooser_path'] = 'direct'
    except PlaywrightTimeoutError:
        if a.locator('.dd-snaplink__trust-dialog').count():
            result['trust_dialog_seen'] = True
            with a.expect_file_chooser(timeout=8000) as fc_info:
                a.get_by_role('button', name='仅本次继续').click()
            fc_info.value.set_files(str(TEST_FILE))
            result['filechooser_path'] = 'trust_continue_once'
        else:
            result['filechooser_path'] = 'none'
    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        result['trust_dialog_seen'] = True
        a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        result['trust_dialog_seen'] = result.get('trust_dialog_seen', False)
    dialog_seen = False
    try:
        b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=45000)
        dialog_seen = True
    except PlaywrightTimeoutError:
        pass
    result['dialog_seen_on_b'] = dialog_seen
    result['a_queue_text'] = a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if a.locator('.dd-snaplink__queue').count() else ''
    result['b_queue_text'] = b.locator('.dd-snaplink__queue').inner_text(timeout=5000) if b.locator('.dd-snaplink__queue').count() else ''
    result['b_dialog_text'] = b.locator('.dd-snaplink__receive-dialog').inner_text(timeout=5000) if dialog_seen else ''
    a.screenshot(path=str(OUT / 'dd-receive-filechooser-flow-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-receive-filechooser-flow-b.png'), full_page=True)
    browser.close()
    if not dialog_seen:
        raise SystemExit(1)
print(result)
