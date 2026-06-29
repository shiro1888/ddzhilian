from playwright.sync_api import sync_playwright

routes = [('/chat', ['附近设备','房间','文件','传输','文本','历史','设置']), ('/image', ['附近设备','房间','文件','传输','文本','历史','设置']), ('/web-command', ['附近设备','房间','文件','传输','文本','历史','设置'])]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for path, labels in routes:
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        page.goto('http://localhost:3000' + path, wait_until='networkidle')
        page.wait_for_timeout(1200)
        result = []
        initial = page.url
        for label in labels:
            try:
                loc = page.get_by_role('button', name=label)
                count = loc.count()
                if count == 0:
                    result.append((label, 'missing'))
                    continue
                loc.first.click(timeout=3000)
                page.wait_for_timeout(500)
                result.append((label, page.url.replace('http://localhost:3000', ''), loc.first.get_attribute('aria-pressed')))
                # go back to route for next label if navigation happened away
                if page.url != 'http://localhost:3000' + path:
                    page.goto('http://localhost:3000' + path, wait_until='networkidle')
                    page.wait_for_timeout(700)
            except Exception as exc:
                result.append((label, 'error', repr(exc)[:200]))
        print({'route': path, 'initial': initial, 'result': result})
        page.screenshot(path=f'C:/Project/ddzhilian/output/chrome-qa/dd-tool-{path.strip("/").replace("/", "-")}-desktop.png', full_page=True)
        page.close()
    browser.close()
