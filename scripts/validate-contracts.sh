#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Validating OpenAPI YAML syntax"
python - <<'PY'
import yaml
from pathlib import Path
p = Path("docs/api/openapi-core.yaml")
yaml.safe_load(p.read_text(encoding="utf-8"))
print("OK:", p)
PY

echo "[2/4] Validating JSON schema syntax"
find docs/schemas -name '*.json' -type f | sort | while read -r file; do
  python -m json.tool "$file" >/dev/null
  echo "OK: $file"
done

echo "[3/4] Validating schema filename naming conventions"
python - <<'PY'
import re
from pathlib import Path

errors = []
pattern = re.compile(r'^[a-z]+\.[a-z0-9_]+\.v[0-9]+\.schema\.json$')
for folder in [Path('docs/schemas/events'), Path('docs/schemas/snapshots')]:
    for p in sorted(folder.glob('*.schema.json')):
        if not pattern.match(p.name):
            errors.append(f"Invalid schema filename: {p}")
if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print("OK: schema filenames")
PY

echo "[4/4] Validating event catalog naming"
python - <<'PY'
import re
from pathlib import Path

catalog = Path('docs/events/catalog.md').read_text(encoding='utf-8')
for line in catalog.splitlines():
    if line.startswith('## '):
        event = line[3:].strip()
        if not re.match(r'^[a-z]+\.[a-z0-9_]+\.v[0-9]+$', event):
            raise SystemExit(f"Invalid event header name: {event}")
print('OK: event names in catalog')
PY

echo "All contract validations passed."
