#!/usr/bin/env bash
# Git authentication stays with the administrator's normal account, never root.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
main() {
  local mode="${1:---git}"
  if [[ "$mode" == --help || "$mode" == -h ]]; then
    echo 'bash update.sh          Получить текущую tracking-ветку из вашего Git и установить'
    echo 'bash update.sh --local  Установить уже полученные файлы, без обращения к Git'
    return
  fi
  [[ $# -le 1 && ( "$mode" == --git || "$mode" == --local ) ]] || { echo 'Используйте --git, --local или --help.' >&2; return 2; }
  [[ $EUID -ne 0 ]] || { echo 'Запускайте update.sh без sudo: права понадобятся только на этапе установки.' >&2; return 1; }
  cd -- "$project_dir"
  if [[ "$mode" == --git ]]; then
    command -v git >/dev/null || { echo 'Git не установлен.' >&2; return 1; }
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo 'Это папка из ZIP. Клонируйте свой Git или используйте --local.' >&2; return 1; }
    git ls-files --error-unmatch -- install.sh update.sh >/dev/null 2>&1 || { echo 'Файлы установщика должны быть добавлены в ваш Git.' >&2; return 1; }
    [[ -z "$(git status --porcelain)" ]] || { echo 'В репозитории есть локальные изменения. Сохраните их перед обновлением; установленные файлы не изменены.' >&2; return 1; }
    git symbolic-ref -q HEAD >/dev/null || { echo 'Выбран отдельный commit/tag. Переключитесь на ветку или используйте --local.' >&2; return 1; }
    git rev-parse --verify '@{upstream}' >/dev/null 2>&1 || { echo 'Для текущей ветки не настроена tracking-ветка.' >&2; return 1; }
    git pull --ff-only --no-rebase
  fi
  # Exec the newly fetched installer, so a self-update uses its new implementation.
  exec sudo bash "$project_dir/install.sh" --update
}
main "$@"
