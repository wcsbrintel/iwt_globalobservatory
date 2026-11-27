const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),T=require('../../ibama-taxonomy.js');
const [full,baseline,registryFile,out]=process.argv.slice(2),registry=JSON.parse(fs.readFileSync(registryFile,'utf8'));
T.setRegistry(registry.records);fs.mkdirSync(out,{recursive:true});
const version='national-full-v3',years=[2020,2021,2022,2023,2024,2025],read=(dir,y)=>JSON.parse(fs.readFileSync(path.join(dir,'ibama-'+y+'.json'),'utf8'));
const officialFauna=/\bfauna\b/,officialFishing=/\b(?:pesca|pesqueira|pesqueiro)\b/,flora=/\b(?:flora|florestal|vegetal|madeira|desmatamento)\b/;
const generic=/\b(?:flora e fauna|fauna e flora|flora ou fauna|fauna ou flora)\b/g;
const direct=/\b(?:cacar|caca predatoria|captur\w* (?:de )?(?:animais|aves|especimes|peixes)|(?:manter|guardar|transportar|vender|comercializar|exportar|importar|matar|perseguir|apanhar)\b.{0,100}\b(?:fauna silvestre|animais? silvestres?|aves silvestres?|especimes? da fauna)|maus tratos (?:a|de|contra) animais|pescar em (?:periodo|local)|pesca proibida|pesca irregular|pesca ilegal|pescar sem)\b/;
const explicitAnimal=x=>!T.plantItem(x)&&(T.animalItem(x)||T.itemNames(x).some(n=>T.verified(n)?.kingdom==='Animalia')||officialFauna.test(T.words(x.infraction_type))&&!flora.test(T.words(x.infraction_type)));
const verifiedNames=new Map();for(const [key,v] of Object.entries(registry.records))if(v.kingdom==='Animalia'&&v.matchType==='EXACT')verifiedNames.set(T.norm(key),v);
const textCandidates=new RegExp('(?:^|[^\\p{L}\\p{N}])('+[...verifiedNames.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|')+')(?![\\p{L}\\p{N}])','giu');
function evidence(p,old){const o=p.official||{},type=T.words(o.administrative_class||p.type),desc=T.words(o.infraction_description||p.description).replace(generic,' '),detail=T.words(o.narrative_detail).replace(generic,' '),items=T.allItems(p);
 if(explicitAnimal&&items.some(explicitAnimal))return 'linked_animal_specimen';
 if(officialFauna.test(type)&&!flora.test(type))return 'official_fauna';
 if(officialFishing.test(type)&&!flora.test(type))return 'official_fishing';
 if(!flora.test(desc)&&(direct.test(desc)||direct.test(detail)))return 'direct_fauna_conduct';
 if(old)return 'previous_validated';
 return '';
}
function addNarrative(p){const o=p.official||{},items=T.allItems(p),structured=new Set(items.flatMap(x=>T.itemNames(x)).map(n=>T.norm(T.canonicalName(n)))),mentions=new Map();
 const texts=[['DES_AUTO_INFRACAO',o.narrative_detail],['DES_INFRACAO',o.infraction_description],...(p.seizure_terms||[]).map(t=>['DS_TAD',t.seizure_detail])];
 for(const [field,raw] of texts){const text=String(raw||'');textCandidates.lastIndex=0;for(const m of text.matchAll(textCandidates)){const v=verifiedNames.get(T.norm(m[1].replace(/\s+/g,' ')));if(!v)continue;const key=T.norm(v.name);if(structured.has(key)||mentions.has(key))continue;const start=m.index+m[0].indexOf(m[1]);const context=text.slice(Math.max(0,start-24),start);if(/\b(?:cf|aff)\.?\s*$/i.test(context))continue;mentions.set(key,{scientific_name:v.name,common_name:'',group:v.group,quantity:null,unit:'',source:'IBAMA '+field+' — textual mention; not confirmed seizure',source_field:field});}}
 p.narrative_species=[...mentions.values()];}
const manifest={schema_version:1,eligibility_version:version,source:'IBAMA',scope:'Brazil nationwide: wildlife and fisheries administrative notices, 2020–2025',unit:'administrative_infraction_notice',date_basis:'notice_date',coverage_start:'2020-01-01',coverage_end:'2025-12-31',generated_at:new Date().toISOString(),years:[]};
const ids=new Set(),review=[],recovered=[],allTaxa=new Set();let oldTotal=0;
for(const y of years){const fullYear=read(full,y),old=read(baseline,y),oldIds=new Set(old.features.map(f=>f.properties.id));oldTotal+=oldIds.size;const kept=[],seen=new Set(),byUf={},reasons={};let geo=0,withStructured=0,withSeized=0,withNarrative=0,plantItems=0;
 if(Object.keys(fullYear.enrichment_status||{}).length!==5||Object.values(fullYear.enrichment_status).some(x=>x!=='ok'))throw Error('Incomplete official resources '+y);
 for(const f of fullYear.features){const p=f.properties;assert.ok(p.official,'Unmatched official record '+p.id);seen.add(p.id);const prior=oldIds.has(p.id),reason=evidence(p,prior);
  if(!reason){if(p.audit_previous_candidate||p.categories?.includes('fishing')||T.allItems(p).some(x=>!T.plantItem(x)&&x.scientific_name))review.push({id:p.id,year:y,type:p.type,infraction_code:p.official.infraction_code,reason:'insufficient_direct_fauna_evidence',scientific_names:T.allItems(p).filter(x=>!T.plantItem(x)).flatMap(x=>T.candidateNames(x.scientific_name))});continue;}
  assert.ok(!ids.has(p.id)&&p.date.startsWith(String(y)+'-'),'Duplicate or invalid date '+p.id);ids.add(p.id);
  p.fauna_evidence={version,reason};p.categories=[...new Set([...(p.categories||[]),'wildlife'])];if(reason==='official_fishing')p.categories=[...new Set([...p.categories,'fishing'])];
  for(const k of ['species_referenced','seized_specimens']){const arr=p[k]||[];p[k]=arr.filter(x=>!T.plantItem(x));plantItems+=arr.length-p[k].length;}
  addNarrative(p);if(p.species_referenced.length)withStructured++;if(p.seized_specimens.length)withSeized++;if(p.narrative_species.length)withNarrative++;
  for(const e of T.entries(T.allItems(p)))allTaxa.add(e.name);
  if(f.geometry){const [lon,lat]=f.geometry.coordinates;assert.ok(Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=-74.5&&lon<=-28&&lat>=-34&&lat<=6&&!(lon===0&&lat===0),'Invalid coordinates');geo++;}
  byUf[p.uf||'unknown']=(byUf[p.uf||'unknown']||0)+1;reasons[reason]=(reasons[reason]||0)+1;
  if(!prior)recovered.push({id:p.id,year:y,type:p.type,reason,previous_candidate:p.audit_previous_candidate===true});
  delete p.audit_previous_candidate;kept.push(f);
 }
 const absent=[...oldIds].filter(id=>!seen.has(id));assert.equal(absent.length,0,'Published IDs absent in updated official source: '+absent.join(','));
 assert.ok(kept.length>=oldIds.size,'Coverage regression '+y);const data={...fullYear,features:kept,scope:manifest.scope,eligibility_version:version,stats:{notices:kept.length,georeferenced:geo,without_coordinates:kept.length-geo,previous_published:oldIds.size,added:kept.length-oldIds.size,by_uf:byUf,eligibility_reasons:reasons,with_species_referenced:withStructured,with_seized_specimens:withSeized,with_narrative_species:withNarrative,plant_items_excluded:plantItems,input_counters:fullYear.stats}};
 const filename='ibama-'+y+'.json',payload=JSON.stringify(data);assert.ok(Buffer.byteLength(payload)<90*1024*1024,'Annual blob too large');fs.writeFileSync(path.join(out,filename),payload);
 const entry={year:y,file:filename,records:kept.length,georeferenced:geo,without_coordinates:kept.length-geo,bytes:Buffer.byteLength(payload),sha256:crypto.createHash('sha256').update(payload).digest('hex'),by_uf:byUf,previous_published:oldIds.size,added:kept.length-oldIds.size,eligibility_reasons:reasons,with_species_referenced:withStructured,with_seized_specimens:withSeized,with_narrative_species:withNarrative,enrichment_status:fullYear.enrichment_status};manifest.years.push(entry);console.log('IBAMA_REBUILT_YEAR '+JSON.stringify(entry));
}
manifest.records=ids.size;manifest.georeferenced=manifest.years.reduce((s,x)=>s+x.georeferenced,0);manifest.previous_records=oldTotal;manifest.added=ids.size-oldTotal;manifest.review_candidates=review.length;manifest.species_preliminary=allTaxa.size;
assert.ok(manifest.added>=399,'Expected confirmed recovery not reached');assert.ok(recovered.length===manifest.added);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'recovery-audit.json'),JSON.stringify({version,recovered,review},null,2));console.log('IBAMA_REBUILT_TOTAL '+JSON.stringify({records:manifest.records,added:manifest.added,georeferenced:manifest.georeferenced,review:review.length,preliminarySpecies:allTaxa.size}));
