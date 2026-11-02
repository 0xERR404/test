#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Нужен sudo.' >&2; exit 1; fi
state_dir=/var/lib/skud-console-lock
[[ -d "$state_dir" ]] || { echo 'Наши настройки блокировки не найдены.'; exit 0; }
if [[ -f "$state_dir/masked-by-us" ]]; then
  while IFS= read -r unit; do
    case "$unit" in
      getty@.service|serial-getty@.service|console-getty.service|ctrl-alt-del.target|getty@tty[1-6].service) systemctl unmask "$unit";;
      *) echo "Неизвестная запись в журнале отката: $unit" >&2; exit 1;;
    esac
  done < "$state_dir/masked-by-us"
fi
rm -f -- /etc/systemd/logind.conf.d/90-skud-kiosk.conf /etc/sysctl.d/99-skud-kiosk.conf
if [[ -f "$state_dir/sysrq-before" ]]; then
  previous="$(cat "$state_dir/sysrq-before")"
  [[ "$previous" =~ ^[0-9]+$ ]] && sysctl -w "kernel.sysrq=$previous"
fi
systemctl daemon-reload
rm -f -- "$state_dir/applied" "$state_dir/masked-by-us" "$state_dir/sysrq-before"
rmdir -- "$state_dir"
echo 'Изменения нашего скрипта отменены. Перезагрузите стенд вручную для восстановления консолей.'
