from pathlib import Path
from playwright.sync_api import sync_playwright, expect

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
    page = browser.new_page(viewport={"width":375,"height":812}, is_mobile=True, has_touch=True)
    if not open_room(page):
        raise AssertionError('没有可打开的房间')
    expect(page.locator('.dd-snaplink__room-mobile-actions')).to_be_visible(timeout=10000)
    page.locator('.dd-snaplink__room-mobile-actions button').filter(has_text='成员').click()
    expect(page.locator('.dd-snaplink__room-member-panel')).to_be_visible(timeout=10000)
    expect(page.locator('.dd-snaplink__room-member-list > span').first).to_be_visible(timeout=10000)
    page.screenshot(path=str(out / 'room-mobile-member-panel.png'), full_page=True)
    info = page.evaluate('''() => {
      const panel = document.querySelector('.dd-snaplink__room-member-panel')?.getBoundingClientRect();
      const queue = document.querySelector('.dd-snaplink__queue')?.getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > innerWidth,
        panel: panel ? {top: panel.top, bottom: panel.bottom, height: panel.height} : null,
        queue: queue ? {top: queue.top, bottom: queue.bottom, height: queue.height} : null,
        memberRows: document.querySelectorAll('.dd-snaplink__room-member-list > span').length,
        activeButton: document.querySelector('.dd-snaplink__room-mobile-actions button.is-active')?.textContent?.trim() || ''
      }
    }''')
    print(info)
    if info['overflowX']:
        raise AssertionError('room member panel overflowX')
    if info['memberRows'] < 1:
        raise AssertionError('member panel has no members')
    browser.close()
