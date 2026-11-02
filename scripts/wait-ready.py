#!/usr/bin/env python3
"""Exit successfully only when the local application is ready."""
import json
import time
from urllib.request import urlopen

for attempt in range(60):
    try:
        with urlopen('http://127.0.0.1:8080/api/health', timeout=2) as response:
            if json.load(response).get('ok'):
                print('Локальный сервер СКУД готов.')
                raise SystemExit(0)
    except (OSError, ValueError):
        pass
    time.sleep(1)
raise SystemExit('Сервер не запустился за отведённое время. Проверьте journalctl -u skud-prototype.')
