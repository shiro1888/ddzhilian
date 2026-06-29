from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out_dir = Path('output/chrome-qa')
out_dir.mkdir(parents=True, exist_ok=True)
paths = ['/chat', '/image', '/web-command']
results = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for path in paths:
        page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
        page.goto(f'http://localhost:3000{path}', wait_until='networkidle')
        expect(page.locator('.dd-snaplink__tool-mobile-queue')).to_be_visible(timeout=10000)
        queue_box = page.locator('.dd-snaplink__tool-mobile-queue').first.bounding_box()
        content_box = page.locator('.dd-snaplink__tool-content').first.bounding_box()
        overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        no_overlap = bool(queue_box and content_box and content_box['y'] >= queue_box['y'] + queue_box['height'] - 1)
        page.screenshot(path=str(out_dir / f'tool-mobile-layout-{path.strip("/")}.png'), full_page=True)
        results.append({
            'path': path,
            'overflowX': overflow,
            'queueBottom': round(queue_box['y'] + queue_box['height'], 2) if queue_box else None,
            'contentY': round(content_box['y'], 2) if content_box else None,
            'noOverlap': no_overlap,
        })
        page.close()
    browser.close()

print(results)
if any(item['overflowX'] or not item['noOverlap'] for item in results):
    raise AssertionError(results)
