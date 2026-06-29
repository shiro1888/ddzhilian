from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys

out = Path('output/chrome-qa')
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width":1280,"height":900})
    page = context.new_page()
    page.goto('http://localhost:3000/text', wait_until='networkidle')
    page.wait_for_selector('.dd-snaplink', timeout=30000)
    room_buttons = page.locator('button').filter(has_text='房间')
    for i in range(room_buttons.count()):
        if room_buttons.nth(i).is_visible():
            room_buttons.nth(i).click()
            break
    page.wait_for_timeout(500)
    page.screenshot(path=str(out / 'route-text-rooms-page.png'), full_page=True)
    room_cards = page.locator('.dd-snaplink__room-card, .dd-snaplink__workbench-room-list button')
    room_count = room_cards.count()
    opened = False
    if room_count > 0:
        for i in range(room_count):
            card = room_cards.nth(i)
            if card.is_visible():
                card.click()
                opened = True
                break
    page.wait_for_timeout(800)
    page.screenshot(path=str(out / 'route-text-room-conversation.png'), full_page=True)
    info = page.evaluate("""
    () => ({
      path: location.pathname,
      opened: !!document.querySelector('.dd-snaplink__room-workbench, .dd-snaplink__conversation, .dd-snaplink__messages'),
      hasRail: !!document.querySelector('.dd-snaplink__rail'),
      hasQueue: !!document.querySelector('.dd-snaplink__queue'),
      hasComposer: !!document.querySelector('textarea, [contenteditable="true"]'),
      hasSharedTabs: !!document.querySelector('.dd-snaplink__shared-tabs, .dd-snaplink__shared-content'),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      visibleHead: document.querySelector('.dd-snaplink__room-header strong, .dd-snaplink__room-title strong, h1')?.textContent?.trim() || '',
    })
    """)
    print(json.dumps({'room_count': room_count, 'clicked': opened, **info}, ensure_ascii=True))
    browser.close()
