#!/usr/bin/env python3
"""One-to-one canonical country-name migration; never touches coordinates, routes, narrative or counts."""
import json, unicodedata
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CODES={
  "Albânia": "AL",
  "Alemanha": "DE",
  "Argélia": "DZ",
  "Argentina": "AR",
  "Armênia": "AM",
  "Arábia Saudita": "SA",
  "Austrália": "AU",
  "África do Sul": "ZA",
  "Áustria": "AT",
  "Bahrein": "BH",
  "Bangladesh": "BD",
  "Belize": "BZ",
  "Benim": "BJ",
  "Bélgica": "BE",
  "Bolívia": "BO",
  "Botsuana": "BW",
  "Brasil": "BR",
  "Bulgária": "BG",
  "Camarões": "CM",
  "Camboja": "KH",
  "Canadá": "CA",
  "Catar": "QA",
  "Cazaquistão": "KZ",
  "Chile": "CL",
  "China": "CN",
  "Chipre": "CY",
  "Colômbia": "CO",
  "Comores": "KM",
  "Coreia do Sul": "KR",
  "Costa do Marfim": "CI",
  "Costa Rica": "CR",
  "Croácia": "HR",
  "Cuba": "CU",
  "Egito": "EG",
  "Emirados Árabes Unidos": "AE",
  "Equador": "EC",
  "Eslováquia": "SK",
  "Espanha": "ES",
  "Estados Unidos": "US",
  "Etiópia": "ET",
  "Fiji": "FJ",
  "Filipinas": "PH",
  "França": "FR",
  "Gabão": "GA",
  "Gana": "GH",
  "Geórgia": "GE",
  "Grécia": "GR",
  "Guatemala": "GT",
  "Guiana": "GY",
  "Guiana Francesa": "GF",
  "Guiné": "GN",
  "Honduras": "HN",
  "Hong Kong": "HK",
  "Hungria": "HU",
  "Indonésia": "ID",
  "Índia": "IN",
  "Irã": "IR",
  "Iraque": "IQ",
  "Israel": "IL",
  "Itália": "IT",
  "Japão": "JP",
  "Jordânia": "JO",
  "Kosovo": "XK",
  "Kuwait": "KW",
  "Laos": "LA",
  "Libéria": "LR",
  "Líbano": "LB",
  "Macedônia do Norte": "MK",
  "Madagascar": "MG",
  "Malawi": "MW",
  "Malásia": "MY",
  "Malta": "MT",
  "Marrocos": "MA",
  "Mauritânia": "MR",
  "Moçambique": "MZ",
  "Moldávia": "MD",
  "Mongólia": "MN",
  "Myanmar": "MM",
  "Macau": "MO",
  "México": "MX",
  "Namíbia": "NA",
  "Nicarágua": "NI",
  "Nigéria": "NG",
  "Nova Zelândia": "NZ",
  "Omã": "OM",
  "Países Baixos": "NL",
  "Paquistão": "PK",
  "Palestina": "PS",
  "Panamá": "PA",
  "Papua-Nova Guiné": "PG",
  "Paraguai": "PY",
  "Peru": "PE",
  "Polinésia Francesa": "PF",
  "Polônia": "PL",
  "Portugal": "PT",
  "Quênia": "KE",
  "Quirguistão": "KG",
  "Reino Unido": "GB",
  "República Democrática do Congo": "CD",
  "República do Congo": "CG",
  "República Dominicana": "DO",
  "Romênia": "RO",
  "Rússia": "RU",
  "Seychelles": "SC",
  "Singapura": "SG",
  "Sri Lanka": "LK",
  "Sudão": "SD",
  "Sudão do Sul": "SS",
  "Suécia": "SE",
  "Suíça": "CH",
  "Suriname": "SR",
  "Síria": "SY",
  "Tadjiquistão": "TJ",
  "Tailândia": "TH",
  "Taiwan": "TW",
  "Tanzânia": "TZ",
  "Tchéquia": "CZ",
  "Togo": "TG",
  "Turquia": "TR",
  "Ucrânia": "UA",
  "Uganda": "UG",
  "Uruguai": "UY",
  "Uzbequistão": "UZ",
  "Vietnã": "VN",
  "Zâmbia": "ZM",
  "Zimbábue": "ZW"
}
ALIASES={
  "Brazil": "Brasil",
  "India": "Índia",
  "Colombia": "Colômbia",
  "Australia": "Austrália",
  "Namibia": "Namíbia",
  "Indonesia": "Indonésia",
  "Tailandia": "Tailândia",
  "Thailand": "Tailândia",
  "Hong Kong (China)": "Hong Kong",
  "França (La Réunion)": "França",
  "França (Reunião)": "França",
  "República Tcheca": "Tchéquia",
  "RDC": "República Democrática do Congo",
  "Ukraine": "Ucrânia",
  "Germany": "Alemanha",
  "Iran": "Irã",
  "Canada": "Canadá",
  "Botswana": "Botsuana",
  "United States": "Estados Unidos",
  "Qatar": "Catar",
  "Zambia": "Zâmbia",
  "Albania": "Albânia",
  "Paises Baixos": "Países Baixos",
  "Tajiquistão": "Tadjiquistão",
  "Japao": "Japão",
  "Paquistao": "Paquistão",
  "Quenia": "Quênia",
  "Quirguistao": "Quirguistão",
  "Mocambique": "Moçambique",
  "Russia": "Rússia",
  "Africa do Sul": "África do Sul",
  "Zimbabue": "Zimbábue",
  "Bolivia": "Bolívia"
}
SPECIAL={"Amazônia multinacional","Brasil / Peru","conforme nome do ponto","Região"}
def fold(s):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD',str(s).casefold()) if not unicodedata.combining(c)).split())
INDEX={fold(k):k for k in CODES}
INDEX.update({fold(k):v for k,v in ALIASES.items()})
def canonical(value):
    if not isinstance(value,str): raise ValueError(f"Non-string country: {value!r}")
    s=value.strip()
    if s in SPECIAL: return s
    if fold(s) not in INDEX: raise ValueError(f"Country not mapped: {value!r}")
    return INDEX[fold(s)]
def save(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def migrate():
    changed_cases=[]; changed_routes=[]
    paths=sorted(p for p in (ROOT/"cases").rglob("*.json") if p.name!="_manifest.json")
    before=Counter();after=Counter()
    for p in paths:
        obj=json.loads(p.read_text(encoding="utf-8"))
        original=obj["country"]; before[original]+=1
        name=canonical(original);after[name]+=1
        if name!=original:
            obj["country"]=name
            save(p,obj)
            changed_cases.append({"id":obj["id"],"old":original,"new":name,"path":str(p.relative_to(ROOT))})
    if sum(before.values())!=len(paths) or sum(after.values())!=len(paths): raise AssertionError("Record loss")
    target=ROOT/"routes.json";doc=json.loads(target.read_text(encoding="utf-8"))
    for route in doc.get("routes",[]):
        for i,segment in enumerate(route.get("segments",[])):
            for endpoint in ("from","to"):
                point=segment.get(endpoint)
                if not isinstance(point,dict) or not isinstance(point.get("country"),str):continue
                old=point["country"]
                new=canonical(old)
                if new!=old:
                    point["country"]=new
                    changed_routes.append({"route_id":route.get("id"),"segment":i,"endpoint":endpoint,"old":old,"new":new})
    if changed_routes:save(target,doc)
    report={"canonical_rule":"One PT country name per ISO region; language-specific UI labels; preserve multinational/unknown categories.","total_cases_before":len(paths),"total_cases_after":len(paths),"distinct_country_values_before":len(before),"distinct_country_values_after":len(after),"case_country_changes":len(changed_cases),"route_endpoint_changes":len(changed_routes),"changes":changed_cases,"route_changes":changed_routes,"remaining_countries":dict(sorted(after.items())),"unresolved_special_categories":{k:after.get(k,0) for k in SPECIAL if after.get(k)}}
    save(ROOT/"audits/country-normalization-2026-11-19.json",report)
    print(f"Normalized {len(changed_cases)} of {len(paths)} cases; {len(changed_routes)} route endpoints; {len(after)} distinct country values.")
if __name__=="__main__":migrate()
