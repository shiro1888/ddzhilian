from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('output/chrome-qa')
out.mkdir(parents=True, exist_ok=True)
routes = ['/text', '/chat', '/image', '/web-command']
labels = ['附近', '房间', '文件', '传输', '文本', '历史', 'AI', '命令', '设置']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for route in routes:
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.goto(f'http://localhost:3000{route}', wait_until='networkidle')
        page.wait_for_selector('.dd-snaplink', timeout=30000)
        page.screenshot(path=str(out / f'route-{route.strip("/").replace("/", "-")}-desktop.png'), full_page=True)
        buttons = []
        for label in labels:
            loc = page.locator('button').filter(has_text=label)
            visible_count = 0
            enabled_count = 0
            for i in range(loc.count()):
                item = loc.nth(i)
                if item.is_visible():
                    visible_count += 1
                    if item.is_enabled():
                        enabled_count += 1
            buttons.append({"label": label, "visible": visible_count, "enabled": enabled_count})
        info = page.evaluate("""
        () => ({
          url: location.pathname,
          hasRail: !!document.querySelector('.dd-snaplink__rail'),
          hasQueue: !!document.querySelector('.dd-snaplink__queue, .dd-snaplink__tool-side-section.is-transfer'),
          hasToolShell: !!document.querySelector('.dd-snaplink.is-workbench-shell'),
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          title: document.querySelector('h1, .dd-snaplink__workbench-page-head strong, .dd-ai-chat__topbar h1')?.textContent?.trim() || '',
        })
        """)
        results.append({"route": route, **info, "buttons": buttons})
        context.close()
    browser.close()

for result in results:
    print(result)

bad = []
for result in results:
    if result['overflowX']:
        bad.append(f"{result['route']} overflowX")
    if not result['hasRail']:
        bad.append(f"{result['route']} no rail")
    if result['route'] != '/text' and not result['hasToolShell']:
        bad.append(f"{result['route']} no tool shell")
    # text route should have all workbench first-level labels visible on desktop rail except maybe image/admin intentionally hidden
    visible = {b['label']: b['visible'] for b in result['buttons']}
    for label in ['附近', '房间', '文件', '传输', '文本', '历史', 'AI', '命令', '设置']:
        if visible.get(label, 0) == 0:
            bad.append(f"{result['route']} label {label} not visible")
if bad:
    raise AssertionError('\n'.join(bad))
