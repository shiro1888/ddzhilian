from pathlib import Path
from playwright.sync_api import sync_playwright
import json

out = Path('output/chrome-qa')
out.mkdir(parents=True, exist_ok=True)

def open_room(page):
    page.goto('http://localhost:3000/text', wait_until='networkidle')
    page.wait_for_selector('.dd-snaplink', timeout=30000)
    rooms = page.locator('button').filter(has_text='房间')
    for i in range(rooms.count()):
        if rooms.nth(i).is_visible():
            rooms.nth(i).click()
            break
    page.wait_for_timeout(400)
    cards = page.locator('.dd-snaplink__room-card, .dd-snaplink__workbench-room-list button')
    for i in range(cards.count()):
        if cards.nth(i).is_visible():
            cards.nth(i).click()
            return True
    return False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for name, viewport, mobile in [
        ('desktop', {"width": 1280, "height": 900}, False),
        ('mobile', {"width": 375, "height": 812}, True),
    ]:
        context = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        clicked = open_room(page)
        page.wait_for_timeout(800)
        page.screenshot(path=str(out / f'room-context-strip-{name}.png'), full_page=True)
        info = page.evaluate("""
        () => {
          const strip = document.querySelector('.dd-snaplink__room-meta-strip')
          const composer = document.querySelector('.dd-snaplink__compose, .dd-snaplink__composer')
          const room = document.querySelector('.dd-snaplink__room')
          const stripRect = strip?.getBoundingClientRect()
          const composerRect = composer?.getBoundingClientRect()
          const roomRect = room?.getBoundingClientRect()
          return {
            hasStrip: !!strip,
            stripText: strip?.textContent?.trim() || '',
            stripTop: stripRect?.top ?? null,
            stripBottom: stripRect?.bottom ?? null,
            composerTop: composerRect?.top ?? null,
            roomBottom: roomRect?.bottom ?? null,
            overflowX: document.documentElement.scrollWidth > window.innerWidth,
            viewportWidth: window.innerWidth,
          }
        }
        """)
        results.append({"name": name, "clicked": clicked, **info})
        context.close()
    browser.close()

print(json.dumps(results, ensure_ascii=True, indent=2))
for item in results:
    if not item['clicked']:
        raise AssertionError(f"{item['name']} 没有可打开的房间")
    if not item['hasStrip']:
        raise AssertionError(f"{item['name']} 未显示房间状态条")
    if item['overflowX']:
        raise AssertionError(f"{item['name']} 出现横向溢出")
