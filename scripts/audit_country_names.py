#!/usr/bin/env python3
"""Inventory (read-only) of country values in the canonical Observatory."""
from collections import Counter, defaultdict
from pathlib import Path
import json
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
def folded(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', str(s or '').strip().casefold()) if not unicodedata.combining(ch))

case_counts = Counter()
route_counts = Counter()
examples = defaultdict(list)
total_cases = 0
for path in sorted((ROOT / "cases").rglob("*.json")):
    if path.name == "_manifest.json":
        continue
    row = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(row, dict):
        raise ValueError(f"Non-object case: {path}")
    key = row.get("country", "")
    if not isinstance(key, str):
        raise ValueError(f"Non-string country: {path}")
    case_counts[key] += 1
    if len(examples[key]) < 4:
        examples[key].append(row.get("id", path.stem))
    total_cases += 1

route_file = json.loads((ROOT / "routes.json").read_text(encoding="utf-8"))
for route in route_file.get("routes", []):
    for segment in route.get("segments", []):
        for end in ("from", "to"):
            point = segment.get(end)
            if isinstance(point, dict):
                value = point.get("country")
                if isinstance(value, str):
                    route_counts[value] += 1

fold_groups = defaultdict(list)
for name, n in case_counts.items():
    fold_groups[folded(name)].append({"name": name, "count": n})
report = {
    "audit_scope": "All individual cases/*.json and route segment endpoint countries; no locations or narrative altered",
    "total_cases": total_cases,
    "country_values_count": len(case_counts),
    "cases": [{"name": key, "count": n, "examples": examples[key]} for key,n in sorted(case_counts.items(), key=lambda x:(-x[1],x[0]))],
    "route_endpoints": [{"name": key, "count": n} for key,n in sorted(route_counts.items(),key=lambda x:(-x[1],x[0]))],
    "orthographic_variants": {key:values for key,values in sorted(fold_groups.items()) if len(values)>1}
}
output=ROOT/"audits/country-inventory-2026-11-19.json"
output.parent.mkdir(exist_ok=True,parents=True)
output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"Audited {total_cases} individual cases; {len(case_counts)} distinct country values.")
