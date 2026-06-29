from playwright.sync_api import sync_playwright

URL = 'http://localhost:3000/text'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1366, "height": 900})
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1000)

    labels = ['附近设备', '房间', '文件', '传输', '文本', '历史', '设置']
    for label in labels:
        btn = page.get_by_role('button', name=label).first
        btn.click(timeout=3000)
        page.wait_for_timeout(500)
        headings = []
        for i in range(page.locator('h1,h2,h3,[role="heading"]').count()):
            t = page.locator('h1,h2,h3,[role="heading"]').nth(i).inner_text(timeout=1000).strip()
            if t:
                headings.append(t)
        pressed = btn.get_attribute('aria-pressed')
        cls = btn.get_attribute('class') or ''
        body = page.locator('body').inner_text(timeout=5000)
        keywords = [kw for kw in ['附近设备','房间','文件发送','传输队列','发送文本','历史记录','设置','拖拽文件到这里','创建房间','还没有传输任务','设备名'] if kw in body]
        print({'clicked': label, 'aria_pressed': pressed, 'class': cls, 'headings': headings[:10], 'keywords': keywords})

    browser.close()
