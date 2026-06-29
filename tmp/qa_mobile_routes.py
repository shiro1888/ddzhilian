from playwright.sync_api import sync_playwright
routes = ['/text', '/chat', '/image', '/web-command']
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for route in routes:
        page = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
        page.goto('http://localhost:3000' + route, wait_until='domcontentloaded')
        page.wait_for_selector('body', timeout=30000)
        page.wait_for_timeout(1600)
        overflow = page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
        scroll_width = page.evaluate('() => document.documentElement.scrollWidth')
        body_text = page.locator('body').inner_text(timeout=5000)
        buttons = [b.strip() for b in page.locator('button').all_inner_texts() if b.strip()][:30]
        results.append({'route': route, 'overflow': overflow, 'scrollWidth': scroll_width, 'buttons': buttons, 'keywords': [kw for kw in ['传输队列','附近','房间','文件','发送文本','运行','登录图片工具','AI 辅助'] if kw in body_text]})
        page.screenshot(path=f'C:/Project/ddzhilian/output/chrome-qa/dd-mobile-{route.strip("/").replace("/", "-") or "root"}.png', full_page=True)
        page.close()
    browser.close()
print(results)
