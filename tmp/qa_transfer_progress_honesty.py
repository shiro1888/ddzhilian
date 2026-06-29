from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(r'C:\Project\ddzhilian')
checks: list[dict[str, Any]] = []


def record(name: str, ok: bool, **details: Any) -> None:
    checks.append({'name': name, 'ok': bool(ok), **details})


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

card = read('src/app/components/TransferTaskCard.tsx')
snap = read('src/app/components/SnapLinkStage.tsx')
app = read('src/App.tsx')
hook = read('src/lib/use-ddzhilian.ts')
utils = read('src/app/utils.ts')

record(
    'card_completed_only_forces_100',
    "status === 'completed'" in card and '? 100' in card,
)
record(
    'card_only_transferring_or_failed_uses_raw_progress',
    "status === 'transferring' || status === 'failed'" in card and ': 0' in card,
)
record(
    'stage_failed_preserves_acknowledged_progress',
    "status === 'transferring' || status === 'failed'" in snap and 'return clampProgress(file.progress)' in snap,
)
record(
    'app_progress_zero_until_transferring_or_failed',
    "if (item.status !== 'transferring' && item.status !== 'failed')" in app and 'return 0' in app,
)
record(
    'app_telemetry_only_while_transferring',
    "if (item.status !== 'transferring')" in app and 'delete transferTelemetrySamplesRef.current[item.id]' in app,
)
record(
    'app_speed_uses_acknowledged_bytes_delta',
    'const deltaBytes = acknowledgedBytes - previousSample.acknowledgedBytes' in app
    and 'const deltaSeconds = (now - previousSample.sampledAt) / 1000' in app
    and 'const instantBytesPerSecond = deltaBytes / deltaSeconds' in app
    and 'sentBytes - previousSample' not in app,
)
record(
    'app_speed_eta_labels_are_derived_from_acknowledged_bytes',
    'const remainingBytes = Math.max(item.fileSize - acknowledgedBytes, 0)' in app
    and 'transferSpeedLabel: `速度 ${speedLabel}`' in app
    and "transferEtaLabel: remainingBytes > 0 ? `剩余 ${formatTransferEta(etaSeconds)}` : '即将完成'" in app,
)
record(
    'app_exposes_speed_eta_to_transfer_entries',
    'transferSpeedLabel: transferTelemetry.transferSpeedLabel' in app
    and 'transferEtaLabel: transferTelemetry.transferEtaLabel' in app,
)
record(
    'card_renders_speed_eta_only_when_available',
    'file.transferSpeedLabel' in card
    and 'file.transferEtaLabel' in card
    and 'aria-label="传输速度与剩余时间"' in card
    and 'telemetryLabels.length > 0' in card,
)
record(
    'hook_ack_progress_only_when_transferring',
    "currentTransfer.status === 'transferring'" in hook and '? acknowledgedBytes / currentTransfer.fileSize' in hook,
)
record(
    'hook_initial_transfer_progress_zero',
    'progress: 0' in hook and 'acknowledgedBytes: 0' in hook,
)
record(
    'status_copy_matches_lan_transfer_spec',
    "case 'waiting_for_target':\n      return '等待设备'" in utils
    and "case 'connecting':\n      return '正在建立直连'" in utils
    and "case 'ready':\n      return '等待对方确认'" in utils
    and "case 'transferring':\n      return '正在发送'" in utils
    and "case 'completed':\n      return '发送成功'" in utils
    and "case 'failed':\n      return '发送失败'" in utils
    and "case 'cancelled':\n      return '已取消'" in utils,
)

# Runtime smoke checks for the two states that can be produced reliably in browser automation.
runtime_scripts = [
    ('waiting_before_accept_is_zero', 'qa_transfer_cancel_before_accept.py', ['0%', '等待对方确认']),
    ('accept_flow_completes_to_100', 'qa_receive_accept_direct.py', ['100%', '发送成功', '已接收']),
]
for name, script, keywords in runtime_scripts:
    proc = subprocess.run(
        [sys.executable, str(ROOT / 'tmp' / script)],
        cwd=ROOT,
        env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
        text=True,
        encoding='utf-8',
        errors='replace',
        capture_output=True,
        timeout=120,
    )
    output = (proc.stdout or '') + (proc.stderr or '')
    record(
        name,
        proc.returncode == 0 and all(keyword in output for keyword in keywords),
        returncode=proc.returncode,
        missing=[keyword for keyword in keywords if keyword not in output],
        output_sample=output[-1000:],
    )

failed = [item for item in checks if not item['ok']]
print(json.dumps({'total': len(checks), 'failed': len(failed), 'checks': checks}, ensure_ascii=False, indent=2))
if failed:
    raise SystemExit(1)
