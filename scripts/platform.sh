#!/usr/bin/env bash
# This file is sourced. Keep platform policy shared by all installer entry points.
skud_supported_ubuntu() {
  [[ "${1:-}" == ubuntu && ( "${2:-}" == 26.10 || "${2:-}" == 26.04 || "${2:-}" == 24.04 ) ]]
}

skud_require_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    echo 'Не найден /etc/os-release. Нужна Ubuntu Server 26.10, 26.04 LTS или 24.04 LTS.' >&2
    return 1
  fi
  local ID='' VERSION_ID=''
  source /etc/os-release
  if ! skud_supported_ubuntu "$ID" "$VERSION_ID"; then
    printf 'Обнаружена система: %s %s. Нужна Ubuntu Server 26.10, 26.04 LTS или 24.04 LTS.\n' "$ID" "$VERSION_ID" >&2
    return 1
  fi
}
