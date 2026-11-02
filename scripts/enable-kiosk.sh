#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Запустите: sudo bash scripts/enable-kiosk.sh' >&2; exit 1; fi
source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 24.04 ]]; then
  echo 'Скрипт рассчитан на отдельный стенд Ubuntu Server 24.04 LTS.' >&2; exit 1
fi
if systemctl is-active --quiet display-manager.service; then
  echo 'Обнаружен работающий рабочий стол. Используйте отдельную Ubuntu Server без desktop.' >&2; exit 1
fi
systemctl is-active --quiet skud-prototype.service || { echo 'Сначала установите сервер СКУД.' >&2; exit 1; }
command -v snap >/dev/null || { echo 'Сначала установите snapd через apt.' >&2; exit 1; }
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
snap list ubuntu-frame >/dev/null 2>&1 || snap install ubuntu-frame
snap list wpe-webkit-mir-kiosk >/dev/null 2>&1 || snap install wpe-webkit-mir-kiosk
snap connect wpe-webkit-mir-kiosk:wayland ubuntu-frame:wayland
snap set ubuntu-frame launcher=false
snap set ubuntu-frame config='wallpaper-top=0x0c192d
wallpaper-bottom=0x0c192d
idle-timeout=0
keymap=us,ru++grp:alt_shift_toggle'
# Derive the service name from snapd, avoiding a hard-coded WPE daemon name.
kiosk_service="$(snap services wpe-webkit-mir-kiosk | awk 'NR==2 {print $1}')"
[[ "$kiosk_service" == wpe-webkit-mir-kiosk.* ]] || { echo 'Не удалось определить сервис WPE.' >&2; exit 1; }
unit_name="snap.${kiosk_service}.service"
install -d -m 0755 "/etc/systemd/system/${unit_name}.d" /opt/skud-prototype/scripts
install -m 0644 "$project_dir/scripts/wait-ready.py" /opt/skud-prototype/scripts/wait-ready.py
cat > "/etc/systemd/system/${unit_name}.d/skud.conf" <<'EOF'
[Unit]
Wants=skud-prototype.service
After=skud-prototype.service
StartLimitIntervalSec=0

[Service]
ExecStartPre=/usr/bin/python3 /opt/skud-prototype/scripts/wait-ready.py
Restart=always
RestartSec=5
EOF
systemctl daemon-reload
snap set ubuntu-frame daemon=true
snap set wpe-webkit-mir-kiosk url=http://127.0.0.1:8080
snap set wpe-webkit-mir-kiosk daemon=true
snap restart wpe-webkit-mir-kiosk
echo 'Киоск включён. После загрузки запускаются локальный сервер и экран входа СКУД.'
echo 'Переключение раскладки: Alt+Shift. Локальные консоли пока сохранены для проверки стенда.'
echo 'После проверки экрана и отдельного SSH-доступа см. scripts/lock-console.sh и README.md.'
