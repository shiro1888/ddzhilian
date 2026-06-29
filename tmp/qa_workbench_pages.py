from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = 'http://localhost:3000'
ROOT = Path(r'C:\Project\ddzhilian')
OUT = ROOT / 'output' / 'chrome-qa'
OUT.mkdir(parents=True, exist_ok=True)
checks: list[dict[str, Any]] = []


def record(name: str, ok: bool, **details: Any) -> None:
    checks.append({'name': name, 'ok': bool(ok), **details})


pages = [
    {
        'label': '附近设备',
        'slug': 'nearby',
        'selector': '.dd-snaplink__workbench-page.is-nearby',
        'keywords': ['附近设备', '重新扫描'],
    },
    {
        'label': '房间',
        'slug': 'rooms',
        'selector': '.dd-snaplink__workbench-page.is-rooms',
        'keywords': ['房间', '创建房间', '加入房间'],
    },
    {
        'label': '文件',
        'slug': 'files',
        'selector': '.dd-snaplink__workbench-page.is-files',
        'keywords': ['文件发送', '当前发送目标', '拖拽文件到这里', '最近发送'],
    },
    {
        'label': '传输',
        'slug': 'transfers',
        'selector': '.dd-snaplink__workbench-page.is-transfers',
        'keywords': ['传输队列', '建立/确认', '按对方确认字节显示', '失败可重试'],
    },
    {
        'label': '文本',
        'slug': 'text',
        'selector': '.dd-snaplink__workbench-page.is-text',
        'keywords': ['发送文本', '当前发送目标', '文本内容', '文本历史'],
    },
    {
        'label': '历史',
        'slug': 'history',
        'selector': '.dd-snaplink__workbench-page.is-history',
        'keywords': ['历史记录', '搜索历史', '文件/媒体', '文本'],
    },
    {
        'label': '设置',
        'slug': 'settings',
        'selector': '.dd-snaplink__workbench-page.is-settings',
        'keywords': ['设置', '当前设备', '连接与发现', '消息主题'],
    },
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 900})
    page.goto(BASE + '/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1400)

    for spec in pages:
        label = spec['label']
        slug = spec['slug']
        selector = spec['selector']
        keywords = spec['keywords']

        nav_button = page.get_by_role('button', name=label).first
        before_url = page.url
        nav_button.click(timeout=5000)
        page.wait_for_timeout(650)
        page.wait_for_selector(selector, timeout=10000)

        body_text = page.locator('body').inner_text(timeout=5000)
        missing_keywords = [keyword for keyword in keywords if keyword not in body_text]
        active_pressed = nav_button.get_attribute('aria-pressed')
        overflow = page.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
        queue_count = page.locator('.dd-snaplink__queue').count()
        page_count = page.locator(selector).count()
        screenshot_path = OUT / f'dd-workbench-{slug}-desktop.png'
        page.screenshot(path=str(screenshot_path), full_page=True)

        record(
            f'workbench_page_{slug}_renders_and_keeps_queue',
            page_count == 1 and queue_count == 1 and not missing_keywords and not overflow,
            label=label,
            before_url=before_url,
            after_url=page.url,
            page_count=page_count,
            queue_count=queue_count,
            missing_keywords=missing_keywords,
            active_pressed=active_pressed,
            overflow=overflow,
            screenshot=str(screenshot_path),
        )

        record(
            f'workbench_nav_{slug}_button_active',
            active_pressed == 'true',
            label=label,
            active_pressed=active_pressed,
        )

    # Mobile pass: page navigation should remain touch-usable and not overflow.
    mobile = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
    mobile.goto(BASE + '/text', wait_until='domcontentloaded')
    mobile.wait_for_selector('.dd-snaplink__mobile-nav', timeout=30000)
    mobile.wait_for_timeout(1200)
    for spec in pages:
        label = spec['label']
        mobile_label = '附近' if label == '附近设备' else label
        slug = spec['slug']
        selector = spec['selector']
        mobile.get_by_role('button', name=mobile_label).first.click(timeout=5000)
        mobile.wait_for_timeout(500)
        mobile.wait_for_selector(selector, timeout=10000)
        overflow = mobile.evaluate('() => document.documentElement.scrollWidth > window.innerWidth')
        queue_count = mobile.locator('.dd-snaplink__queue').count()
        actionbar_count = mobile.locator('.dd-snaplink__mobile-actions').count()
        record(
            f'mobile_workbench_page_{slug}_renders_without_overflow',
            mobile.locator(selector).count() == 1 and queue_count == 1 and actionbar_count == 1 and not overflow,
            label=label,
            queue_count=queue_count,
            actionbar_count=actionbar_count,
            overflow=overflow,
            scroll_width=mobile.evaluate('() => document.documentElement.scrollWidth'),
        )
    mobile.screenshot(path=str(OUT / 'dd-workbench-pages-mobile.png'), full_page=True)

    browser.close()

failed = [item for item in checks if not item['ok']]
print(json.dumps({'total': len(checks), 'failed': len(failed), 'checks': checks}, ensure_ascii=False, indent=2))
if failed:
    raise SystemExit(1)
