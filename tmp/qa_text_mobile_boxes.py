from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":375,"height":812}, is_mobile=True, has_touch=True)
    page.goto('http://localhost:3000/text', wait_until='networkidle')
    selectors=['.dd-snaplink','.dd-snaplink__app','.dd-snaplink__workbench','.dd-snaplink__workbench-main','.dd-snaplink__workbench-status','.dd-snaplink__mobile-nav','.dd-snaplink__workbench-content']
    for sel in selectors:
        box=page.locator(sel).first.bounding_box()
        print(sel, box)
    print(page.evaluate('''() => ({scrollY: window.scrollY, bodyTop: document.body.getBoundingClientRect().top, htmlOverflow: document.documentElement.scrollWidth > innerWidth})'''))
    browser.close()
