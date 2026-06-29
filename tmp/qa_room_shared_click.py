from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('output/chrome-qa'); out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  page=browser.new_page(viewport={"width":1280,"height":900})
  page.goto('http://localhost:3000/text', wait_until='networkidle')
  page.wait_for_selector('.dd-snaplink')
  for i in range(page.locator('button').filter(has_text='房间').count()):
    b=page.locator('button').filter(has_text='房间').nth(i)
    if b.is_visible(): b.click(); break
  page.wait_for_timeout(300)
  cards=page.locator('.dd-snaplink__room-card, .dd-snaplink__workbench-room-list button')
  for i in range(cards.count()):
    if cards.nth(i).is_visible(): cards.nth(i).click(); break
  page.wait_for_timeout(500)
  # click 历史内容
  loc=page.locator('button').filter(has_text='历史内容')
  print('hist buttons', loc.count())
  for i in range(loc.count()):
    if loc.nth(i).is_visible(): loc.nth(i).click(); break
  page.wait_for_timeout(500)
  page.screenshot(path=str(out/'route-text-room-shared-content.png'), full_page=True)
  info=page.evaluate("""() => ({
    shared: !!document.querySelector('.dd-snaplink__shared, .dd-snaplink__shared-content, .dd-snaplink__shared-panel'),
    text: document.body.innerText.slice(0,800),
    overflowX: document.documentElement.scrollWidth > innerWidth
  })""")
  print(json.dumps(info, ensure_ascii=True))
  browser.close()
