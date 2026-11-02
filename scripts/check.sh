#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_dir"
for script in ./*.sh scripts/*.sh; do bash -n "$script"; done
python3 -B -m unittest discover -s tests -v
echo 'Синтаксис shell и серверные тесты: OK.'
