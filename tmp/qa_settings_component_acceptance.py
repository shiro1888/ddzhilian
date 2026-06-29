from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(r'C:\Project\ddzhilian')
BASE = 'http://localhost:3000'
OUT = ROOT / 'output' / 'chrome-qa'
OUT.mkdir(parents=True, exist_ok=True)
checks: list[dict[str, Any]] = []


def record(name: str, ok: bool, **details: Any) -> None:
    checks.append({'name': name, 'ok': bool(ok), **details})


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')

required_components = [
    'SidebarNav',
    'TopStatusBar',
    'NearbyDevicesPanel',
    'DeviceCard',
    'DropZone',
    'FileSendPage',
    'SendTargetSelector',
    'TransferQueuePanel',
    'TransferQueuePage',
    'TransferTaskCard',
    'RoomsPage',
    'RoomCard',
    'RoomHeader',
    'RoomConversationStream',
    'RoomComposer',
    'SharedContentPanel',
    'MessageBubble',
    'FileMessageCard',
    'TextSendPage',
    'HistoryPage',
    'SettingsPanel',
    'EmptyState',
    'SkeletonRows',
    'ConfirmReceiveDialog',
    'TrustDeviceDialog',
    'PinInput',
    'MobileActionBar',
    'MobileWorkbenchNav',
    'ToolContextPanel',
]

missing_files = []
missing_exports = []
for component in required_components:
    path = ROOT / 'src' / 'app' / 'components' / f'{component}.tsx'
    if not path.exists():
        missing_files.append(component)
        continue
    source = path.read_text(encoding='utf-8')
    if f'export function {component}' not in source and f'export type {component}' not in source and f'export const {component}' not in source:
        missing_exports.append(component)

record('required_component_files_exist', not missing_files, missing=missing_files)
record('required_components_use_named_exports', not missing_exports, missing=missing_exports)

component_sources = '\n'.join(path.read_text(encoding='utf-8') for path in (ROOT / 'src' / 'app' / 'components').glob('*.tsx'))
not_referenced = [
    component
    for component in required_components
    if f"from './{component}'" not in component_sources and component not in {'SnapLinkStage'}
]
record('required_components_are_wired_into_component_graph', not not_referenced, missing=not_referenced)

settings_source = read('src/app/components/SettingsPanel.tsx')
settings_required_terms = [
    '设备名',
    '允许被发现',
    '允许短码连接',
    '自动连接同账号设备',
    '回车发送',
    '浅色',
    '深色',
    '跟随系统',
    '发送的信息框',
    '接收的信息框',
    'AI 的信息框',
    '恢复默认',
]
record(
    'settings_panel_covers_required_controls',
    all(term in settings_source for term in settings_required_terms),
    missing=[term for term in settings_required_terms if term not in settings_source],
)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 860})
    page.goto(f'{BASE}/text', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__app', timeout=30000)
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='设置').first.click()
    page.wait_for_timeout(600)

    color_inputs = page.locator('.dd-snaplink__workbench-page.is-settings input[type="color"]')
    mode_buttons = page.locator('.dd-snaplink__settings-mode-option')
    switch_buttons = page.locator('.dd-snaplink__settings-switch')
    record(
        'settings_runtime_controls_visible',
        color_inputs.count() == 3 and mode_buttons.count() == 3 and switch_buttons.count() >= 4,
        color_count=color_inputs.count(),
        mode_count=mode_buttons.count(),
        switch_count=switch_buttons.count(),
    )

    def css_var(name: str) -> str:
        return page.locator('.dd-snaplink').first.evaluate("(el, name) => getComputedStyle(el).getPropertyValue(name).trim()", name)

    def set_color_input(label: str, value: str) -> None:
        page.get_by_label(label).evaluate(
            """(el, value) => {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }""",
            value,
        )

    page.get_by_label('发送的信息框颜色').fill('#123456')
    page.wait_for_timeout(250)
    self_var = css_var('--snap-theme-self').lower()
    stored_after_custom = page.evaluate("() => window.localStorage.getItem('ddzhilian:snaplink-theme-colors')")
    record(
        'theme_color_input_updates_css_and_storage',
        self_var == '#123456' and stored_after_custom and '#123456' in stored_after_custom.lower(),
        self_var=self_var,
        stored=stored_after_custom,
    )

    page.get_by_role('button', name='微信绿').click()
    page.wait_for_timeout(250)
    preset_self = css_var('--snap-theme-self').lower()
    preset_peer = css_var('--snap-theme-peer').lower()
    preset_ai = css_var('--snap-theme-ai').lower()
    record(
        'theme_preset_updates_all_message_colors',
        preset_self == '#95ec69' and preset_peer == '#f2f8ed' and preset_ai == '#eaf7e1',
        preset={'self': preset_self, 'peer': preset_peer, 'ai': preset_ai},
    )

    page.get_by_role('button', name='恢复默认').click()
    page.wait_for_timeout(250)
    reset_self = css_var('--snap-theme-self').lower()
    reset_peer = css_var('--snap-theme-peer').lower()
    reset_ai = css_var('--snap-theme-ai').lower()
    record(
        'theme_reset_restores_default_colors',
        reset_self == '#f9887f' and reset_peer == '#f5f4f1' and reset_ai == '#eff6ff',
        reset={'self': reset_self, 'peer': reset_peer, 'ai': reset_ai},
    )

    page.get_by_role('button', name='深色').click()
    page.wait_for_timeout(300)
    record(
        'settings_dark_mode_button_applies_theme_mode',
        page.evaluate("() => document.documentElement.getAttribute('data-theme-mode')") == 'dark'
        and page.evaluate("() => document.documentElement.classList.contains('dark')"),
        mode=page.evaluate("() => document.documentElement.getAttribute('data-theme-mode')"),
        html_class=page.evaluate("() => document.documentElement.className"),
    )

    page.screenshot(path=str(OUT / 'settings-component-acceptance.png'), full_page=True)
    browser.close()

failed = [item for item in checks if not item['ok']]
print(json.dumps({'total': len(checks), 'failed': len(failed), 'checks': checks}, ensure_ascii=False, indent=2))
if failed:
    raise SystemExit(1)
