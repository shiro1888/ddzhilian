from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base_url = 'http://localhost:3000/image'
out_dir = Path('output/chrome-qa')
out_dir.mkdir(parents=True, exist_ok=True)

results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for label, viewport in [('desktop', {'width': 1280, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
        context = browser.new_context(viewport=viewport, device_scale_factor=1, is_mobile=(label == 'mobile'))
        page = context.new_page()
        page.goto(base_url, wait_until='networkidle')
        gate = page.locator('.dd-image-auth-gate')
        expect(gate).to_be_visible(timeout=10000)
        expect(page.get_by_text('AI 图片工作台')).to_be_visible(timeout=10000)
        expect(page.get_by_text('图片生成需要账号')).to_be_visible(timeout=10000)
        page.screenshot(path=str(out_dir / f'image-auth-{label}.png'), full_page=True)
        overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        results.append({
            'label': label,
            'url': page.url,
            'hasGate': gate.count() > 0,
            'overflowX': overflow,
            'visibleButtons': [button.inner_text().strip() for button in page.locator('button:visible').all()[:20]],
        })
        context.close()
    browser.close()

print(results)
