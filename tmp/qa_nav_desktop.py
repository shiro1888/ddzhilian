from playwright.sync_api import sync_playwright

URL = 'http://localhost:3000/text'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1366, "height": 900})
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1000)

    report = []
    labels = ['附近设备', '房间', '文件', '传输', '文本', '历史', '设置']
    for label in labels:
        try:
            loc = page.get_by_role('button', name=label)
            count = loc.count()
            if count == 0:
                report.append((label, 'missing', ''))
                continue
            loc.first.click(timeout=3000)
            page.wait_for_timeout(500)
            text = page.locator('body').inner_text(timeout=5000)
            sample = ' | '.join([line.strip() for line in text.splitlines() if line.strip()][:16])
            report.append((label, 'clicked', sample[:360]))
        except Exception as exc:
            report.append((label, 'error', repr(exc)[:360]))

    print(report)
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-nav-desktop-after-clicks.png', full_page=True)
    browser.close()
