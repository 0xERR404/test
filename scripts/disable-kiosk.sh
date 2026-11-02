#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Нужен sudo.' >&2; exit 1; fi
# Keep application data and server intact; stop only the kiosk services.
snap set wpe-webkit-mir-kiosk daemon=false
snap stop --disable wpe-webkit-mir-kiosk
snap set ubuntu-frame daemon=false
snap stop --disable ubuntu-frame
echo 'Графический киоск остановлен. Сервер СКУД и данные сохранены.'
echo 'Если консоли были заблокированы, сначала выполните unlock-console.sh по SSH.'
