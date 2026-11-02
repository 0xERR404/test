#!/usr/bin/env bash
# Entry point for installation from an ordinary local Git checkout or ZIP.
set -Eeuo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:---kiosk}"
usage() {
  cat <<'EOF'
СКУД — установщик для Ubuntu Server 26.04 LTS (также поддерживается 24.04 LTS)

  sudo bash install.sh                 Сервер + полноэкранный киоск (по умолчанию)
  sudo bash install.sh --server-only   Только локальный сервер
  sudo bash install.sh --update        Обновить уже установленный сервер из этой папки
       bash install.sh --check         Проверить код без установки
       bash install.sh --help          Эта справка

Клонирование и обновление Git выполняйте обычным пользователем.
Установщик не перезагружает ОС и не отключает консоли автоматически.
EOF
}
[[ $# -le 1 ]] || { usage; exit 2; }
case "$mode" in
  --help|-h) usage; exit 0;;
  --check) exec bash "$project_dir/scripts/check.sh";;
  --kiosk|--server-only|--update) ;;
  *) usage; exit 2;;
esac
[[ "$(uname -s)" == Linux && -f /etc/os-release ]] || { echo 'Установка выполняется на Ubuntu, не на Windows.' >&2; exit 1; }
source "$project_dir/scripts/platform.sh"
skud_require_ubuntu
[[ $EUID -eq 0 ]] || { echo "Запустите: sudo bash install.sh $mode" >&2; exit 1; }
[[ -d /run/systemd/system ]] || { echo 'Нужна запущенная система с systemd.' >&2; exit 1; }
if [[ "$mode" == --kiosk ]] && systemctl is-active --quiet display-manager.service; then
  echo 'Работает стандартный рабочий стол. Установите киоск на отдельную Ubuntu Server без desktop.' >&2
  exit 1
fi
if [[ "$mode" == --update && ! -f /etc/systemd/system/skud-prototype.service ]]; then
  echo 'СКУД ещё не установлена. Сначала: sudo bash install.sh' >&2; exit 1
fi
# Serialize installation/update; fail rather than race with another invocation.
exec 9>/run/lock/skud-prototype-install.lock
flock -n 9 || { echo 'Другой установщик СКУД уже работает.' >&2; exit 1; }
install -d -m 0750 /var/log/skud-prototype
log_file="/var/log/skud-prototype/install-$(date +%Y%m%d-%H%M%S).log"
touch "$log_file"
chmod 0640 "$log_file"
exec > >(tee -a "$log_file") 2>&1
trap 'code=$?; echo "Установка прервана, код $code. Журнал: $log_file"; exit "$code"' ERR
echo "СКУД · $(date --iso-8601=seconds) · режим $mode"
echo '[1/5] Системные зависимости'
if [[ "$mode" != --update ]]; then
  apt-get update
  packages=(python3 ca-certificates)
  if [[ "$mode" == --kiosk ]]; then packages+=(snapd); fi
  apt-get install -y --no-install-recommends "${packages[@]}"
  if [[ "$mode" == --kiosk ]]; then
    systemctl enable --now snapd.socket
    snap wait system seed.loaded
  fi
fi
command -v python3 >/dev/null || { echo 'Python3 не найден.' >&2; exit 1; }
echo '[2/5] Проверка исходников и тесты'
bash "$project_dir/scripts/check.sh"
echo '[3/5] Резервная копия существующей базы'
if [[ -f /var/lib/skud-prototype/skud.sqlite3 ]]; then
  bash "$project_dir/scripts/backup.sh"
else
  echo 'Первая установка: существующей базы нет.'
fi
echo '[4/5] Установка сервера'
bash "$project_dir/scripts/install-server.sh"
echo '[5/5] Графический интерфейс'
if [[ "$mode" == --kiosk ]]; then
  bash "$project_dir/scripts/enable-kiosk.sh"
elif command -v snap >/dev/null && snap list wpe-webkit-mir-kiosk >/dev/null 2>&1; then
  if [[ "$(snap get wpe-webkit-mir-kiosk daemon 2>/dev/null || true)" == true ]]; then
    snap restart wpe-webkit-mir-kiosk
  fi
fi
echo
echo 'Готово. Логин: operator. При первой установке пароль: demo1234.'
echo 'Ранее изменённый пароль сохранён. Настройка: /etc/skud-prototype/environment'
echo 'Обновление из вашего Git: bash update.sh'
echo "Журнал установки: $log_file"
echo 'Для проверки автозапуска перезагрузите стенд вручную: sudo reboot'
echo 'После проверки SSH можно ограничить консоли: см. INSTALL.md.'
