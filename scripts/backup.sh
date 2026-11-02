#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Нужен sudo.' >&2; exit 1; fi
umask 077
python3 - <<'PY'
from contextlib import closing
from datetime import datetime
from pathlib import Path
import sqlite3

source = Path('/var/lib/skud-prototype/skud.sqlite3')
if not source.is_file():
    raise SystemExit('Установленная база не найдена')
target_dir = Path('/var/backups/skud-prototype')
target_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
target = target_dir / ('skud-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src, closing(sqlite3.connect(target)) as dst:
    src.backup(dst)
print('Резервная копия:', target)
PY
