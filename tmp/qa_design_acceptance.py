from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = 'http://localhost:3000'
OUT = Path(r'C:\Project\ddzhilian\output\chrome-qa')
OUT.mkdir(parents=True, exist_ok=True)

checks: list[dict[str, Any]] = []

def record(name: str, ok: bool, **details: Any) -> None:
    checks.append({'name': name, 'ok': bool(ok), **details})


def box(page, selector: str):
    return page.locator(selector).first.bounding_box()


def no_x_overflow(page) -> bool:
    return bool(page.evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'))


def visible_count(page, selector: str) -> int:
    return page.locator(selector).count()


def nav_labels(locator) -> list[str]:
    return [item.strip() for item in locator.all_inner_texts() if item.strip()]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Desktop workbench acceptance.
    desktop = browser.new_page(viewport={'width': 1366, 'height': 900})
    desktop.goto(f'{BASE}/text', wait_until='domcontentloaded')
    desktop.wait_for_selector('.dd-snaplink__app', timeout=30000)
    desktop.wait_for_timeout(1200)

    rail_box = box(desktop, '.dd-snaplink__rail')
    queue_box = box(desktop, '.dd-snaplink__queue')
    status_text = desktop.locator('.dd-snaplink__workbench-status').inner_text(timeout=5000)
    body_text = desktop.locator('body').inner_text(timeout=5000)
    rail_names = nav_labels(desktop.locator('.dd-snaplink__rail button'))
    expected_nav = ['附近设备', '房间', '文件', '传输', '文本', '历史', 'AI', '图片', '命令', '设置']
    record(
        'desktop_three_column_shell',
        bool(rail_box and 60 <= rail_box['width'] <= 84 and queue_box and 280 <= queue_box['width'] <= 380 and no_x_overflow(desktop)),
        rail_width=rail_box['width'] if rail_box else None,
        queue_width=queue_box['width'] if queue_box else None,
        overflow=not no_x_overflow(desktop),
    )
    record(
        'desktop_status_security_copy',
        all(text in status_text for text in ['局域网可发现', 'WebRTC 直连', '文件不经过服务器']) and '本机' in status_text,
        status=status_text,
    )
    record(
        'desktop_nav_all_required_entries',
        all(label in rail_names for label in expected_nav),
        rail_names=rail_names,
    )
    record(
        'desktop_first_screen_p2p_mindset',
        all(text in body_text for text in ['附近设备', '拖拽文件到这里', '仅在设备之间传输', '传输队列']),
        sample=body_text[:400],
    )

    mode_expectations = {
        '附近设备': ('.dd-snaplink__workbench-page.is-nearby', ['附近设备', '拖拽文件到这里']),
        '房间': ('.dd-snaplink__workbench-page.is-rooms.is-full', ['创建房间', '加入房间']),
        '文件': ('.dd-snaplink__workbench-page.is-files', ['文件发送', '拖拽文件到这里', '当前发送目标']),
        '传输': ('.dd-snaplink__workbench-page.is-transfers', ['传输队列', '进行中', '已完成', '失败']),
        '文本': ('.dd-snaplink__workbench-page.is-text', ['发送文本', '文本内容', '文本历史']),
        '历史': ('.dd-snaplink__workbench-page.is-history', ['历史记录', '文件', '文本']),
        '设置': ('.dd-snaplink__workbench-page.is-settings', ['设备名', '允许被发现', '回车发送']),
    }
    for label, (selector, keywords) in mode_expectations.items():
        desktop.get_by_role('button', name=label).first.click()
        desktop.wait_for_timeout(500)
        active = desktop.get_by_role('button', name=label).first.get_attribute('aria-pressed') == 'true'
        page_visible = visible_count(desktop, selector) > 0
        text_scope = '.dd-snaplink__workbench-content' if label == '附近设备' else selector
        text = desktop.locator(text_scope).first.inner_text(timeout=5000) if page_visible else desktop.locator('body').inner_text(timeout=5000)
        record(
            f'desktop_mode_{label}',
            active and page_visible and all(keyword in text for keyword in keywords) and no_x_overflow(desktop),
            active=active,
            page_visible=page_visible,
            missing=[keyword for keyword in keywords if keyword not in text],
            overflow=not no_x_overflow(desktop),
        )

    # Guard against previous regression: text page must not show file-specific target copy.
    desktop.get_by_role('button', name='文本').first.click()
    desktop.wait_for_timeout(500)
    text_page_text = desktop.locator('.dd-snaplink__workbench-page.is-text').inner_text(timeout=5000)
    record(
        'text_page_target_copy_is_text_specific',
        '发送文本前' in text_page_text and '选择文件后会先确认设备' not in text_page_text,
        text_page_sample=text_page_text[:500],
    )
    desktop.screenshot(path=str(OUT / 'design-acceptance-desktop.png'), full_page=True)

    # Mobile workbench acceptance.
    mobile = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
    mobile.goto(f'{BASE}/text', wait_until='domcontentloaded')
    mobile.wait_for_selector('.dd-snaplink__app', timeout=30000)
    mobile.wait_for_timeout(1200)
    mobile_nav_names = nav_labels(mobile.locator('.dd-snaplink__mobile-workbench-nav button'))
    record(
        'mobile_shell_no_overflow_nav',
        no_x_overflow(mobile) and all(label in mobile_nav_names for label in ['附近', '房间', '文件', '传输', '文本', '历史', '设置']),
        mobile_nav_names=mobile_nav_names,
        scroll_width=mobile.evaluate('() => document.documentElement.scrollWidth'),
    )
    mobile.get_by_role('button', name='文件').first.click()
    mobile.wait_for_timeout(500)
    action_boxes = mobile.locator('.dd-snaplink__mobile-actionbar button, .dd-snaplink__mobile-actionbar label').evaluate_all(
        "els => els.map(el => { const r = el.getBoundingClientRect(); return {text: el.innerText || el.textContent || '', height: r.height, width: r.width}; })"
    )
    record(
        'mobile_actionbar_touch_targets',
        len(action_boxes) >= 3 and all(item['height'] >= 54 for item in action_boxes) and no_x_overflow(mobile),
        action_boxes=action_boxes,
    )
    queue_before = box(mobile, '.dd-snaplink__queue')
    mobile.locator('.dd-snaplink__queue-toggle').first.click()
    mobile.wait_for_timeout(300)
    queue_after = box(mobile, '.dd-snaplink__queue')
    record(
        'mobile_queue_drawer_expandable',
        bool(queue_before and queue_after and queue_after['height'] >= queue_before['height'] and no_x_overflow(mobile)),
        before=queue_before,
        after=queue_after,
    )
    mobile.screenshot(path=str(OUT / 'design-acceptance-mobile.png'), full_page=True)

    # Tool route shell acceptance from AI/command PDF.
    for path, keyword in [('/chat', 'AI 辅助'), ('/image', '登录图片工具'), ('/web-command', '命令行')]:
        page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
        page.goto(f'{BASE}{path}', wait_until='domcontentloaded')
        page.wait_for_selector('.dd-snaplink__app', timeout=30000)
        page.wait_for_timeout(1200)
        page_text = page.locator('body').inner_text(timeout=5000)
        queue = box(page, '.dd-snaplink__tool-mobile-queue, .dd-snaplink__queue')
        content = box(page, '.dd-snaplink__tool-content, .dd-ai-chat, .dd-web-command, .dd-image-auth-card')
        record(
            f'tool_mobile_shell_{path}',
            no_x_overflow(page)
            and visible_count(page, '.dd-snaplink__tool-mobile-nav') > 0
            and visible_count(page, '.dd-snaplink__queue') > 0
            and keyword in page_text
            and bool(queue and content and content['y'] >= queue['y']),
            keyword=keyword,
            has_keyword=keyword in page_text,
            queue=queue,
            content=content,
            overflow=not no_x_overflow(page),
        )
        page.screenshot(path=str(OUT / f'design-acceptance-tool-{path.strip("/")}.png'), full_page=True)
        page.close()

    browser.close()

failed = [check for check in checks if not check['ok']]
print(json.dumps({'total': len(checks), 'failed': len(failed), 'checks': checks}, ensure_ascii=False, indent=2))
if failed:
    raise SystemExit(1)
