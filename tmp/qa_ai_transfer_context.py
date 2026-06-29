from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)
TEST_FILE = Path(r'C:\Project\ddzhilian\tmp\ai-transfer-context.txt')
TEST_FILE.write_text('AI transfer context fixture', encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_a = browser.new_context(viewport={'width': 1366, 'height': 900})
    ctx_b = browser.new_context(viewport={'width': 1366, 'height': 900})
    a = ctx_a.new_page()
    b = ctx_b.new_page()

    for page in (a, b):
        page.goto('http://localhost:3000/text', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(1800)

    b_name = b.locator('.dd-snaplink__workbench-status .dd-snaplink__identity strong').first.inner_text(timeout=5000).strip()
    names = [name.strip() for name in a.locator('.dd-snaplink__workbench-device-title strong').all_inner_texts()]
    target_index = next((index for index, name in enumerate(names) if name == b_name), None)
    if target_index is None:
        raise RuntimeError({'b_name': b_name, 'names': names})

    a.locator('.dd-snaplink__workbench-device-main').nth(target_index).click()
    a.wait_for_timeout(500)
    a.locator('input[type="file"][multiple]').first.set_input_files(str(TEST_FILE))

    try:
        a.wait_for_selector('.dd-snaplink__trust-dialog', timeout=8000)
        a.get_by_role('button', name='仅本次继续').click()
    except PlaywrightTimeoutError:
        pass

    b.wait_for_selector('.dd-snaplink__receive-dialog', timeout=45000)
    b.get_by_role('button', name='接收文件').click()
    a.locator('.dd-snaplink__queue-card[data-transfer-status="completed"][data-transfer-direction="outgoing"]').wait_for(timeout=45000)

    a.get_by_role('button', name='AI').first.click()
    a.wait_for_selector('.dd-ai-chat', timeout=30000)
    action = a.locator('.dd-snaplink__tool-side-actions button').filter(has_text='分析最近传输')
    action_label = action.first.inner_text(timeout=5000) if action.count() else ''
    if action.count() == 0:
        raise RuntimeError('AI transfer context action missing')
    action.first.click()
    a.wait_for_timeout(700)

    textarea = a.locator('.dd-ai-chat__composer textarea')
    draft = textarea.input_value(timeout=5000) if textarea.count() else ''
    context_label = a.locator('.dd-ai-chat__context-pill').first.inner_text(timeout=5000)
    context_files = a.locator('.dd-ai-chat__context-files.is-transfer-context').first.inner_text(timeout=5000)
    overflow = a.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
    a.screenshot(path=str(OUT / 'dd-ai-transfer-context-draft.png'), full_page=True)

    result = {
        'action_label': action_label,
        'context_label': context_label,
        'context_files': context_files,
        'draft_has_ddzhilian': 'DD直连' in draft,
        'draft_has_sections': '文件概览' in draft or '发送前检查' in draft,
        'draft_has_file_list': '文件列表' in draft,
        'draft_has_filename': TEST_FILE.name in draft,
        'context_has_transfer_label': '传输文件' in context_label,
        'context_has_filename': TEST_FILE.name in context_files,
        'draft_preview': draft[:260],
        'overflow': overflow,
    }
    print(result)

    failures = []
    if result['action_label'] != '分析最近传输':
        failures.append('AI side action did not switch to recent-transfer analysis')
    if not result['draft_has_ddzhilian']:
        failures.append('AI draft does not mention DD直连')
    if not result['draft_has_sections']:
        failures.append('AI draft does not request structured transfer explanation')
    if not result['draft_has_file_list']:
        failures.append('AI draft does not include 文件列表')
    if not result['draft_has_filename']:
        failures.append('AI draft does not include transferred filename')
    if not result['context_has_transfer_label']:
        failures.append('AI context label does not show 传输文件')
    if not result['context_has_filename']:
        failures.append('AI context sidebar does not show transferred filename')
    if result['overflow']:
        failures.append('AI transfer context page has horizontal overflow')
    browser.close()

    if failures:
        raise SystemExit({'failures': failures, **result})
