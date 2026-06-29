from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('output/chrome-qa'); out.mkdir(parents=True, exist_ok=True)
routes=['/text','/chat','/image','/web-command']
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  results=[]
  for route in routes:
    context=browser.new_context(viewport={"width":375,"height":812}, is_mobile=True, has_touch=True)
    page=context.new_page()
    page.goto(f'http://localhost:3000{route}', wait_until='networkidle')
    page.wait_for_selector('.dd-snaplink', timeout=30000)
    page.screenshot(path=str(out/f'route-{route.strip("/").replace("/","-")}-mobile.png'), full_page=True)
    info=page.evaluate("""() => ({
      path: location.pathname,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      hasMobileNav: !!document.querySelector('.dd-snaplink__mobile-nav, .dd-snaplink__tool-mobile-nav'),
      hasActionBar: !!document.querySelector('.dd-snaplink__mobile-actions, .dd-snaplink__tool-mobile-actions'),
      hasQueue: !!document.querySelector('.dd-snaplink__queue, .dd-snaplink__tool-mobile-queue'),
      visibleButtons: Array.from(document.querySelectorAll('button')).filter(b => {
        const r=b.getBoundingClientRect();
        const s=getComputedStyle(b);
        return r.width>0 && r.height>0 && s.visibility !== 'hidden' && s.display !== 'none';
      }).map(b => b.textContent.trim()).slice(0,80)
    })""")
    results.append(info)
    context.close()
  browser.close()
print(json.dumps(results, ensure_ascii=True, indent=2))
for info in results:
  if info['overflowX']:
    raise AssertionError(f"{info['path']} mobile overflowX")
  if not info['hasMobileNav']:
    raise AssertionError(f"{info['path']} no mobile nav")
