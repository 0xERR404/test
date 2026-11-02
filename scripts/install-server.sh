#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Запустите: sudo bash scripts/install-server.sh' >&2; exit 1; fi
source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 24.04 ]]; then
  echo 'Установщик рассчитан на Ubuntu Server 24.04 LTS.' >&2; exit 1
fi
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v python3 >/dev/null || { echo 'Сначала установите python3 через apt.' >&2; exit 1; }
python3 -c 'import sys,sqlite3; assert sys.version_info >= (3,10)'
id skud-prototype >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/skud-prototype --shell /usr/sbin/nologin skud-prototype
install -d -o root -g root -m 0755 /opt/skud-prototype /opt/skud-prototype/web
install -d -o skud-prototype -g skud-prototype -m 0700 /var/lib/skud-prototype
install -d -o root -g root -m 0700 /etc/skud-prototype
# Stop before copying so an update never serves a mixture of old and new files.
if systemctl is-active --quiet skud-prototype.service; then systemctl stop skud-prototype.service; fi
install -o root -g root -m 0644 "$project_dir/server.py" /opt/skud-prototype/server.py
for file in index.html app.js style.css; do
  install -o root -g root -m 0644 "$project_dir/web/$file" "/opt/skud-prototype/web/$file"
done
install -o root -g root -m 0644 "$project_dir/scripts/skud-prototype.service" /etc/systemd/system/skud-prototype.service
if [[ ! -e /etc/skud-prototype/environment ]]; then
  (umask 077; printf '%s\n' 'SKUD_PASSWORD=demo1234' > /etc/skud-prototype/environment)
fi
systemctl daemon-reload
systemctl enable --now skud-prototype.service
python3 "$project_dir/scripts/wait-ready.py"
echo 'СКУД установлена. Данные: /var/lib/skud-prototype. Начальный вход: operator / demo1234.'
echo 'Пароль хранится в /etc/skud-prototype/environment. Существующий пароль и база сохранены.'
