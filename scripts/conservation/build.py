#!/usr/bin/env python3
"""Build a source-attributed conservation catalog. Never infer absence from failed retrieval."""
import csv, io, json, pathlib, re, sys, zipfile, xml.etree.ElementTree as ET, collections, datetime, os
import requests
from bs4 import BeautifulSoup
BASE="https://raw.githubusercontent.com/wcsbrintel/iwt_globalobservatory/"
IUCN="https://hosted-datasets.gbif.org/datasets/iucn/iucn-latest.zip"
IUCN_REF="https://doi.org/10.15468/0qnb58"
CMS="https://www.cms.int/legalinstrument/cms"
CITES="https://cites.org/eng/app/appendices.php"
session=requests.Session(); session.headers.update({"User-Agent":"WCS-Brasil-Observatory conservation metadata (public scientific data)"})
def fetch(url):
 r=session.get(url,timeout=120);r.raise_for_status();return r.content
def key(x):return " ".join(str(x or "").lower().split())
def binomial(x):
 m=re.match(r"^([A-Z][a-z-]+ [a-z-]+)\b",str(x or ""))
 return key(m.group(1)) if m else ""
def jsdata(p):return json.loads(pathlib.Path(p).read_text().split("=",1)[1].strip().rstrip(";"))
idx=jsdata("species-index.js");seed=jsdata("species-status-seed.js")
try:
 remote=json.loads(fetch(BASE+"ibama-data/ibama-fauna/species-index.json"))
 if remote.get("records"):idx=remote
except Exception as e:print("Current IBAMA index unavailable:",e)
try:prior=json.loads(fetch(BASE+"conservation-data/species-status.json"))
except Exception:prior=seed
records={x["key"]:{"name":x["name"],"common":x.get("common","")} for x in idx["records"]}
for k,v in records.items():
 for p in (prior.get("records",{}).get(k,{}),seed.get("records",{}).get(k,{})):
  for f in ("cites","cms","iucn"):
   if f in p:v[f]=p[f]
  if not v["common"] and p.get("common"):v["common"]=p["common"]
aliases=collections.defaultdict(set)
for k in records:aliases[k].add(k)
for branch in ("taxonomy-data/species-registry.json","ibama-data/ibama-fauna/species-registry.json"):
 try:
  for k,v in json.loads(fetch(BASE+branch))["records"].items():
   if v.get("kingdom")=="Animalia" and v.get("matchType")=="EXACT" and key(v.get("name")) in records:aliases[key(k)].add(key(v["name"]))
 except Exception as e:print("Alias source unavailable",branch,str(e))
errors={};coverage={}
def stage(name,fn):
 try:coverage[name]=fn()
 except Exception as e:errors[name]=str(e);print("SOURCE ERROR",name,str(e),flush=True)
def iucn():
 z=zipfile.ZipFile(io.BytesIO(fetch(IUCN)));meta=ET.fromstring(z.read("meta.xml"));ns={"d":"http://rs.tdwg.org/dwc/text/"}
 def table(el):
  loc=el.find("d:files/d:location",ns).text
  names={int(f.attrib["index"]):f.attrib["term"].split("/")[-1] for f in el.findall("d:field",ns)}
  idel=el.find("d:id",ns)
  if idel is None:idel=el.find("d:coreid",ns)
  names[int(idel.attrib["index"])]= "_id"
  delim=el.attrib.get("fieldsTerminatedBy","\\t").replace("\\t","\t")
  skip=int(el.attrib.get("ignoreHeaderLines","0"))
  with z.open(loc) as raw:
   reader=csv.reader(io.TextIOWrapper(raw,encoding="utf-8-sig",errors="replace"),delimiter=delim)
   for _ in range(skip):next(reader,None)
   for row in reader:yield {v:row[k] if k<len(row) else "" for k,v in names.items()}
 core=meta.find("d:core",ns);tax={};lineage={}
 for r in table(core):
  if key(r.get("taxonRank"))!="species":continue
  n=binomial(r.get("scientificName"));targets=aliases.get(n,set())
  if targets:
   tax[r["_id"]]=targets
   for k in targets:lineage[k]={f:r.get(f,"") for f in ("kingdom","phylum","class","order","family","genus")}
 values=collections.defaultdict(set)
 codes={"extinct":"EX","extinct in the wild":"EW","critically endangered":"CR","endangered":"EN","vulnerable":"VU","near threatened":"NT","least concern":"LC","data deficient":"DD","not evaluated":"NE"}
 for ext in meta.findall("d:extension",ns):
  fields={f.attrib.get("term","").split("/")[-1] for f in ext.findall("d:field",ns)}
  if "threatStatus" not in fields:continue
  for r in table(ext):
   if r["_id"] not in tax:continue
   status=r.get("threatStatus","").strip();code=codes.get(key(status),status.upper())
   if code not in codes.values():continue
   # Distribution extension can have regional rows; accept global only or unspecified in global dataset.
   loc=key(r.get("locality") or r.get("locationID") or "")
   if loc and loc not in ("global","world","worldwide","earth"):continue
   for k in tax[r["_id"]]:values[k].add(code)
 if len(values)<100:raise RuntimeError("Unexpected IUCN coverage: "+str(len(values))+"; inspect archive schema")
 for k,v in values.items():
  if len(v)==1:records[k]["iucn"]={"value":next(iter(v)),"source":IUCN_REF,"version":"GBIF IUCN Red List archive"}
 return {"matched":sum(len(v)==1 for v in values.values()),"conflicts":sum(len(v)>1 for v in values.values())}
def cms():
 soup=BeautifulSoup(fetch(CMS),"html.parser");found=collections.defaultdict(set);n=0
 for tr in soup.select("table tr"):
  td=tr.find_all("td",recursive=False)
  if len(td)<6:continue
  name=binomial(td[0].get_text(" ",strip=True))
  if not name:continue
  m=re.fullmatch(r"\s*(\d{4})?\s*/\s*(\d{4})?\s*",td[-1].get_text(" ",strip=True))
  if not m:continue
  n+=1
  for k in aliases.get(name,set()):
   if m.group(1):found[k].add("I")
   if m.group(2):found[k].add("II")
 if n<500:raise RuntimeError("CMS table incomplete: "+str(n))
 # Official COP15 changes take precedence over older website species table.
 added={"alopias pelagicus":["I","II"],"alopias superciliosus":["I","II"],"alopias vulpinus":["I","II"],"sphyrna lewini":["I","II"],"sphyrna mokarran":["I","II"],"pteronura brasiliensis":["I","II"],"mustelus schmitti":["II"],"pseudoplatystoma corruscans":["II"],"panthera onca":["I","II"],"bubo scandiacus":["II"],"sporophila iberaensis":["II"]}
 for k,v in added.items():
  if k in records:found[k].update(v)
 for k,v in found.items():
  if v:records[k]["cms"]={"values":sorted(v),"source":"https://www.cms.int/species/appendix-i-ii-cms","annotation":"See current appendices for population restrictions and reservations."}
 return {"rows":n,"matched":len(found)}
def cites():
 # Explicit entries only. A group listing or absent match must be checked in the official checklist.
 # Table layout must have I/II/III header and three appendix cells; skip all non-listing rows.
 soup=BeautifulSoup(fetch(CITES),"html.parser");found=collections.defaultdict(set);rows=0
 for table in soup.select("table"):
  header=False
  for tr in table.select("tr"):
   cells=tr.find_all(["td","th"],recursive=False)
   if len(cells)!=3:continue
   txt=[c.get_text(" ",strip=True) for c in cells]
   if [x.strip().upper().replace("APPENDIX ","") for x in txt]==["I","II","III"]:header=True;continue
   if not header:continue
   rows+=1
   for i,cell in enumerate(cells):
    for tag in cell.select("i,em"):
     raw=tag.get_text(" ",strip=True)
     # An explicit scientific name must start its own entry, not an exception embedded in prose.
     if not re.fullmatch(r"[A-Z][a-z-]+ [a-z-]+",raw):continue
     if re.search(r"\b(?:except|excluding|previously|includes|only)\b",cell.get_text(" ",strip=True),re.I):continue
     for k in aliases.get(binomial(raw),set()):found[k].add(["I","II","III"][i])
 if rows<100 or len(found)<30:raise RuntimeError("CITES table unavailable or unexpected structure: "+str((rows,len(found))))
 for k,v in found.items():
  if k not in seed["records"]:records[k]["cites"]={"values":sorted(v),"source":CITES,"annotation":"Explicit listing; check annotations and population restrictions in official appendices."}
 return {"rows":rows,"matched":len(found)}
stage("iucn",iucn);stage("cms",cms);stage("cites",cites)
# Positive matches only; never manufacture NC or NE.
summary={"species":len(records),"verified":{f:sum(f in v for v in records.values()) for f in ("cites","cms","iucn")},"complete":sum(all(f in v for f in ("cites","cms","iucn")) for v in records.values()),"sources":coverage,"errors":errors}
out={"schema_version":1,"generated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"summary":summary,"records":records}
pathlib.Path("species-status.json").write_text(json.dumps(out,ensure_ascii=False,indent=2))
pathlib.Path("conservation-audit.json").write_text(json.dumps({"summary":summary,"unverified":{f:[v["name"] for v in records.values() if f not in v] for f in ("cites","cms","iucn")}},ensure_ascii=False,indent=2))
print("CONSERVATION COVERAGE",json.dumps(summary),flush=True)
