#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/5] Validating OpenAPI YAML syntax"
python - <<'PY'
import yaml
from pathlib import Path
p = Path("docs/api/openapi-core.yaml")
yaml.safe_load(p.read_text(encoding="utf-8"))
print("OK:", p)
PY

echo "[2/5] Validating JSON schema syntax"
find docs/schemas -name '*.json' -type f | sort | while read -r file; do
  python -m json.tool "$file" >/dev/null
  echo "OK: $file"
done

echo "[3/5] Validating schema filename naming conventions"
python - <<'PY'
import re
from pathlib import Path

errors = []
pattern = re.compile(r'^[a-z0-9_-]+(?:\.[a-z0-9_-]+)?\.v[0-9]+\.schema\.json$')
for folder in [Path('docs/schemas/events'), Path('docs/schemas/snapshots')]:
    for p in sorted(folder.glob('*.schema.json')):
        if not pattern.match(p.name):
            errors.append(f"Invalid schema filename: {p}")
if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print("OK: schema filenames")
PY

echo "[4/5] Validating event catalog naming"
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

echo "[5/5] Validating required domain events and schema links"
python - <<'PY'
from pathlib import Path

required_events = [
    'campaign.published.v1',
    'operation.step_completed.v1',
    'operation.snapshot_created.v1',
    'formalization.gate_changed.v1',
    'settlement.completed.v1',
    'reconciliation.divergence_opened.v1',
    'portal.critical_action_logged.v1',
]

catalog = Path('docs/events/catalog.md').read_text(encoding='utf-8')
missing = []
missing_schema = []
for event in required_events:
    if f'## {event}' not in catalog:
        missing.append(event)
    schema = Path(f'docs/schemas/events/{event}.schema.json')
    if not schema.exists():
        missing_schema.append(str(schema))

if missing:
    raise SystemExit('Missing required event sections in catalog: ' + ', '.join(missing))
if missing_schema:
    raise SystemExit('Missing required event schema files: ' + ', '.join(missing_schema))

print('OK: required event catalog and schemas')
PY

echo "All contract validations passed."
