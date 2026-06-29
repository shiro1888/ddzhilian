from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\receive-accept-direct.txt')
TEST_FILE.write_text('direct accept receive test', encoding='utf-8')
result={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    a=browser.new_context(viewport={'width':1280,'height':860}).new_page()
    b=browser.new_context(viewport={'width':1280,'height':860}).new_page()
    for page in (a,b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(2000)
    b_name=b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000)
    names=a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()
    target_index=next((i for i, name in enumerate(names) if name.strip()==b_name.strip()), None)
    result.update({'b_name': b_name, 'names': names, 'target_index': target_index})
    if target_index is not None:
        a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
        a.wait_for_timeout(500)
        a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))
    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        result['trust_dialog_seen_on_a'] = True
        a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        result['trust_dialog_seen_on_a'] = False
    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=60000)
    result['dialog_seen_on_b']=True
    b.get_by_role('button', name='接收文件').click()
    completed=False
    try:
        a.locator('.dd-snaplink__queue-card[data-transfer-status="completed"][data-transfer-direction="outgoing"]').wait_for(timeout=45000)
        completed=True
    except PlaywrightTimeoutError:
        completed=False
    result['a_completed']=completed
    result['a_queue_text']=a.locator('.dd-snaplink__queue').inner_text(timeout=5000) if a.locator('.dd-snaplink__queue').count() else ''
    result['b_queue_text']=b.locator('.dd-snaplink__queue').inner_text(timeout=5000) if b.locator('.dd-snaplink__queue').count() else ''
    a.screenshot(path=str(OUT / 'dd-receive-accept-direct-a.png'), full_page=True)
    b.screenshot(path=str(OUT / 'dd-receive-accept-direct-b.png'), full_page=True)
    browser.close()
print(result)
