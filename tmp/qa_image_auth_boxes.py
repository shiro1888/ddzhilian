from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    page.goto('http://localhost:3000/image', wait_until='networkidle')
    selectors = ['.dd-snaplink__tool-status', '.dd-snaplink__tool-mobile-nav', '.dd-snaplink__tool-mobile-actions', '.dd-snaplink__tool-mobile-queue', '.dd-image-auth-card']
    for sel in selectors:
        box = page.locator(sel).first.bounding_box()
        print(sel, box)
    print('scrollY', page.evaluate('window.scrollY'))
    browser.close()
