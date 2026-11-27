#!/usr/bin/env python3
"""Build 2020–2025 IBAMA administrative notices in separate annual GeoJSON files."""
import argparse
import collections
import csv
import datetime
import io
import json
import os
import re
import tempfile
import unicodedata
import urllib.request
import zipfile

SOURCE = "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip"
CATALOG = "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao"
STATES = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}
# Broad national candidate selection mirrors the source enrichment classifier.
WILDLIFE = re.compile(r"\b(?:ANIMA(?:L|IS) SILVESTR\w*|FAUNA|CACA PREDATORIA|CACAR ANIMAIS|COMERCIO DE ANIMAIS)\b")

def normalize(value):
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(x for x in plain if not unicodedata.combining(x)).upper()
    return re.sub("[^A-Z0-9]+", "_", plain).strip("_")

def field(row, *keys):
    return next((str(row[normalize(k)]).strip() for k in keys if str(row.get(normalize(k), "")).strip()), "")

def decimal(v):
    try:
        return float(str(v).replace(",", "."))
    except (ValueError, TypeError):
        return None

def parse_date(s):
    s = str(s or "").strip()
    for pattern, order in [(r"^(\d{4})-(\d\d)-(\d\d)",(0,1,2)),(r"^(\d\d)/(\d\d)/(\d{4})",(2,1,0))]:
        m = re.search(pattern,s)
        if m:
            x=m.groups()
            try:
                d=datetime.date(*[int(x[k]) for k in order])
                return d.isoformat() if 2020 <= d.year <= 2025 else ""
            except ValueError:
                pass
    return ""

def classify(tipo, descricao):
    t,d=normalize(tipo),normalize(descricao)
    if "PESCA" in t or ("FAUNA" in t and "PESC" in d): return "fishing"
    if "MINER" in t or "GARIMPO" in t: return "mining"
    if "POLU" in t or "CONTAMIN" in t: return "pollution"
    if "FOGO" in t or "QUEIMADA" in t or "INCENDIO" in d: return "fire"
    if "FAUNA" in t: return "wildlife"
    if "FLORA" in t or "VEGETA" in t or "DESMAT" in t:
        if any(x in d for x in ("MADEIRA","TRANSPORTAR","TORAS","SERRARIA","EXTRAIR")): return "logging"
        if any(x in d for x in ("DESMAT","SUPRIMIR","DESTRUIR","VEGETACAO","CORTE_RASO")): return "deforestation"
        return "flora_other"
    return "other"


YEARS=tuple(range(2020,2026))

def build(output_dir, years=YEARS):
    years=set(years)
    if not years.issubset(YEARS) or not years:
        raise ValueError("Years must be between 2020 and 2025")
    request=urllib.request.Request(SOURCE,headers={"User-Agent":"WCSBrasil-GlobalWildlifeObservatory/2020-2025 official public data"})
    with tempfile.NamedTemporaryFile(suffix=".zip",delete=False) as tmp:
        local=tmp.name
        with urllib.request.urlopen(request,timeout=180) as resp:
            size=0
            while True:
                chunk=resp.read(1048576)
                if not chunk: break
                size+=len(chunk)
                if size>650*1024*1024:raise RuntimeError("IBAMA source ZIP exceeds safety threshold")
                tmp.write(chunk)
    features={y:[] for y in years}
    seen={y:set() for y in years}
    counts={y:collections.Counter() for y in years}
    try:
        with zipfile.ZipFile(local) as archive:
            annual={}
            for name in archive.namelist():
                if not name.lower().endswith(".csv"):continue
                match=re.search(r"(202[0-5])[^/]*\.csv$",name,re.I)
                if match and int(match.group(1)) in years:
                    annual.setdefault(int(match.group(1)),[]).append(name)
            missing=years-set(annual)
            if missing:raise RuntimeError("Missing annual IBAMA CSV resources: "+str(sorted(missing)))
            for y in sorted(years):
                for name in annual[y]:
                    with archive.open(name) as f: sample=f.read(8192)
                    try: sample.decode("utf-8-sig");encoding="utf-8-sig"
                    except UnicodeError:encoding="latin-1"
                    with archive.open(name) as raw:
                        stream=io.TextIOWrapper(raw,encoding=encoding,errors="replace",newline="")
                        first=stream.readline()
                        delimiter=";" if first.count(";")>=first.count(",") else ","
                        import itertools
                        reader=csv.DictReader(itertools.chain([first],stream),delimiter=delimiter)
                        headers={normalize(k) for k in (reader.fieldnames or [])}
                        if "UF" not in headers or not ({"TIPO_INFRACAO","TIPO_INF"}&headers):
                            raise RuntimeError("Unexpected IBAMA "+str(y)+" schema in "+name+": "+str(sorted(headers)[:25]))
                        for source_row in reader:
                            counts[y]["records_read"]+=1
                            row={normalize(k):v for k,v in source_row.items() if k}
                            date=parse_date(field(row,"DAT_HORA_AUTO_INFRACAO","DATA_AUTO_INFRACAO","DAT_AUT","DAT_HORA_AUT","DATA_AUT","DAT_LAVRATURA"))
                            if not date or int(date[:4])!=y:continue
                            counts[y]["year_"+str(y)]+=1
                            uf=normalize(field(row,"UF"))
                            if uf not in STATES:
                                counts[y]["uf_missing_or_unknown"]+=1
                            # Retain national records with missing UF for auditing; never invent a state.
                            tipo_raw=field(row,"TIPO_INFRACAO","TIPO_INF","NOME_INF")
                            descriptor=" ".join(normalize(field(row,k)).replace("_"," ") for k in ("DES_INFRACAO","DES_AUTO_INFRACAO","DS_ENQUADRAMENTO_ADMINISTRATIVO","DS_ENQUADRAMENTO_NAO_ADMINISTRATIVO","OPERACAO","FUNDAMENTACAO_MULTA"))
                            if "FAUNA" not in normalize(tipo_raw) and not WILDLIFE.search(descriptor):
                                counts[y]["outside_fauna"]+=1;continue
                            cancelled=normalize(field(row,"SIT_CANCELADO","SIT_AUT_CANCELADO"))
                            status=normalize(field(row,"DES_STATUS_FORMULARIO"))
                            if cancelled in {"S","SIM","TRUE","1"} or any(x in status for x in ("CANCEL","EXCLUID","SUBSTITUID")):
                                counts[y]["cancelled"]+=1;continue
                            lat=decimal(field(row,"NUM_LATITUDE_AUTO","NUM_LATITUDE","LATITUDE","NUM_LAT"))
                            lon=decimal(field(row,"NUM_LONGITUDE_AUTO","NUM_LONGITUDE","LONGITUDE","NUM_LON"))
                            # Generous Brazilian bounds including oceanic islands; no inferred location.
                            coordinate_ok=lat is not None and lon is not None and -34.0<=lat<=6.0 and -74.5<=lon<=-28.0 and not (lat==0 and lon==0)
                            if not coordinate_ok:counts[y]["missing_or_invalid_coordinates"]+=1
                            key=field(row,"SEQ_AUTO_INFRACAO","SEQ_AUT")
                            if not key:key=field(row,"NUM_AUTO_INFRACAO","NUM_AUT")+"-"+field(row,"SER_AUTO_INFRACAO","SER_AUT")
                            if not key.strip("- "):
                                counts[y]["missing_id"]+=1;continue
                            if key in seen[y]:
                                counts[y]["duplicate_id"]+=1;continue
                            seen[y].add(key)
                            tipo=field(row,"TIPO_INFRACAO","TIPO_INF","NOME_INF")
                            descricao=re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b","[redacted]",field(row,"DES_INFRACAO","DES_INF"))
                            category=classify(tipo,descricao)
                            features[y].append({"type":"Feature","geometry":{"type":"Point","coordinates":[lon,lat]} if coordinate_ok else None,
                              "properties":{"id":"IBAMA-"+str(y)+"-"+re.sub("[^A-Za-z0-9_-]","",key)[:45],
                                "category":category,"date":date,"uf":uf,
                                "municipality":field(row,"MUNICIPIO","NOM_MUNICIPIO")[:100],
                                "notice":(field(row,"NUM_AUTO_INFRACAO","NUM_AUT")+" "+field(row,"SER_AUTO_INFRACAO","SER_AUT")).strip()[:80],
                                "type":tipo[:100],"description":descricao[:250],"source_url":CATALOG}})
                            counts[y]["category_"+category]+=1
    finally:
        os.unlink(local)
    os.makedirs(output_dir,exist_ok=True)
    for year in sorted(years):
        if not features[year]:
            raise RuntimeError("No georeferenced IBAMA "+str(year)+" records: refusing to publish empty official data")
        features[year].sort(key=lambda f:(f["properties"]["date"],f["properties"]["id"]))
        dataset={"type":"FeatureCollection","year":year,"source":"IBAMA official open data – autos de infração",
           "source_url":CATALOG,"scope":"Brazil nationwide (27 UFs; missing UF retained), wildlife candidates",
           "generated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "stats":dict(counts[year]),"features":features[year]}
        filename=os.path.join(output_dir,"ibama-"+str(year)+".json")
        with open(filename+".tmp","w",encoding="utf-8") as f:
            json.dump(dataset,f,ensure_ascii=False,separators=(",",":"))
        os.replace(filename+".tmp",filename)
        print("IBAMA official",year,"published",len(features[year]),"georeferenced notices",dict(counts[year]),flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output-dir",default="public/data")
    parser.add_argument("--years",default="2020,2021,2022,2023,2024,2025")
    args=parser.parse_args()
    build(args.output_dir,tuple(int(x) for x in args.years.split(",")))
