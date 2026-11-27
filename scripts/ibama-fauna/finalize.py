#!/usr/bin/env python3
"""Validate and publish only fauna records, preserving separate units and missing coordinates."""
import argparse, collections, hashlib, json, pathlib, datetime
p=argparse.ArgumentParser()
p.add_argument("directory",type=pathlib.Path)
args=p.parse_args()
root=args.directory
manifest={"schema_version":1,"source":"IBAMA","scope":"Brazil nationwide; wildlife thematic category, 2020-2025","unit":"administrative_infraction_notice","date_basis":"notice_date","coverage_start":"2020-01-01","coverage_end":"2025-12-31","generated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"years":[]}
ids=set()
for y in range(2020,2026):
 path=root/f"ibama-{y}.json"
 d=json.loads(path.read_text(encoding="utf-8"))
 if d.get("year")!=y or d.get("enrichment_status",{}).get("autos")!="ok":raise RuntimeError(f"Invalid or unenriched IBAMA year {y}")
 rows=[];by_uf=collections.Counter();geo=0
 for f in d["features"]:
  p=f["properties"]
  if "wildlife" not in p.get("categories",[p.get("category")]):continue
  if not p.get("official"):raise RuntimeError(f"Missing official enrichment: {p['id']}")
  assert p["id"] not in ids and p["date"].startswith(str(y)+"-")
  ids.add(p["id"])
  g=f.get("geometry")
  if g:
   x,z=g["coordinates"]
   assert -74.5<=x<=-28 and -34<=z<=6 and (x!=0 or z!=0)
   geo+=1
  rows.append(f);by_uf[p.get("uf") or "unknown"]+=1
 if not rows:raise RuntimeError(f"Empty fauna year {y}")
 d["features"]=rows;d["scope"]=manifest["scope"]
 d["stats"]={"notices":len(rows),"georeferenced":geo,"without_coordinates":len(rows)-geo,"by_uf":dict(by_uf),"input_counters":d.get("stats",{})}
 payload=json.dumps(d,ensure_ascii=False,separators=(",",":")).encode("utf-8")
 # Split into independent year chunks if a year grows beyond the single file budget.
 # Current publication is annual; reject oversized GitHub blobs instead of losing records.
 if len(payload)>90*1024*1024:raise RuntimeError(f"Annual file exceeds GitHub blob budget: {y}")
 path.write_bytes(payload)
 manifest["years"].append({"year":y,"file":path.name,"records":len(rows),"georeferenced":geo,"without_coordinates":len(rows)-geo,"bytes":len(payload),"sha256":hashlib.sha256(payload).hexdigest(),"by_uf":dict(by_uf),"enrichment_status":d.get("enrichment_status",{})})
 audit=root/f"ibama-{y}-audit.json"
 if audit.exists():audit.unlink()
 print(f"IBAMA FAUNA BRASIL {y}: {len(rows)} autos; {geo} georreferenciados; {len(rows)-geo} sem coordenadas",flush=True)
manifest["records"]=len(ids)
manifest["georeferenced"]=sum(x["georeferenced"] for x in manifest["years"])
(root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
print("IBAMA FAUNA BRASIL TOTAL",manifest["records"],manifest["georeferenced"],flush=True)
