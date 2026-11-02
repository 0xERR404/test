#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Нужен sudo.' >&2; exit 1; fi
if [[ "${1:-}" != --ssh-tested ]]; then
  echo 'Сначала проверьте вход по SSH в отдельной сессии. Затем: sudo bash scripts/lock-console.sh --ssh-tested' >&2
  exit 1
fi
if ! systemctl is-active --quiet ssh.service && ! systemctl is-active --quiet ssh.socket; then
  echo 'SSH не активен. Консоли не будут отключены.' >&2; exit 1
fi
systemctl is-active --quiet skud-prototype.service || { echo 'Сервер СКУД не активен.' >&2; exit 1; }
[[ "$(snap get ubuntu-frame daemon)" == true ]] || { echo 'Сначала включите и проверьте киоск.' >&2; exit 1; }
state_dir=/var/lib/skud-console-lock
if [[ -e "$state_dir/applied" ]]; then echo 'Настройки ограничения консолей уже применены.'; exit 0; fi
if [[ -e "$state_dir" ]]; then echo 'Найдено незавершённое применение. Сначала запустите unlock-console.sh.' >&2; exit 1; fi
install -d -m 0700 "$state_dir" /etc/systemd/logind.conf.d
sysctl -n kernel.sysrq > "$state_dir/sysrq-before"
touch "$state_dir/masked-by-us"
for unit in getty@.service serial-getty@.service console-getty.service ctrl-alt-del.target; do
  current_state="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  if [[ "$current_state" != masked ]]; then
    printf '%s\n' "$unit" >> "$state_dir/masked-by-us"
    systemctl mask "$unit"
  fi
done
# Also mask explicitly enabled VT instances, while retaining an exact rollback list.
for number in {1..6}; do
  unit="getty@tty${number}.service"
  current_state="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  if [[ "$current_state" != masked ]]; then
    printf '%s\n' "$unit" >> "$state_dir/masked-by-us"
    systemctl mask "$unit"
  fi
done
cat > /etc/systemd/logind.conf.d/90-skud-kiosk.conf <<'EOF'
[Login]
NAutoVTs=0
ReserveVT=0
EOF
printf '%s\n' 'kernel.sysrq = 0' > /etc/sysctl.d/99-skud-kiosk.conf
sysctl -w kernel.sysrq=0
systemctl daemon-reload
touch "$state_dir/applied"
echo 'Консольный вход отключён для следующей загрузки. Перезагрузите стенд вручную по SSH.'
echo 'Откат по SSH: sudo bash scripts/unlock-console.sh. Активные сессии сейчас не обрывались.'
