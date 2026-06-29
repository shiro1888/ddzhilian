from playwright.sync_api import sync_playwright

URL = 'http://localhost:3000/text'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 375, "height": 812}, is_mobile=True)
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1200)

    labels = ['附近', '房间', '文件', '传输', '文本', '历史', '设置']
    report = []
    for label in labels:
        try:
            loc = page.get_by_role('button', name=label)
            if loc.count() == 0:
                report.append((label, 'missing', None, []))
                continue
            loc.first.click(timeout=3000)
            page.wait_for_timeout(400)
            bbox = loc.first.bounding_box()
            text = page.locator('body').inner_text(timeout=5000)
            keywords = [kw for kw in ['附近设备','房间','文件发送','传输队列','发送文本','历史记录','设置','选择文件','拍照'] if kw in text]
            report.append((label, 'clicked', bbox, keywords))
        except Exception as exc:
            report.append((label, 'error', repr(exc)[:240], []))

    overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    print({'report': report, 'horizontal_overflow': overflow, 'width': page.evaluate('window.innerWidth'), 'scrollWidth': page.evaluate('document.documentElement.scrollWidth')})
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-nav-mobile-375.png', full_page=True)
    browser.close()
