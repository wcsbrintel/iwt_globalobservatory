const fs=require('node:fs'),path=require('node:path'),T=require('../../ibama-taxonomy.js');
const [full,prior,registryPath,out]=process.argv.slice(2);
T.setRegistry(JSON.parse(fs.readFileSync(registryPath,'utf8')).records);
const years=[2020,2021,2022,2023,2024,2025],read=(dir,y)=>JSON.parse(fs.readFileSync(path.join(dir,'ibama-'+y+'.json'),'utf8'));
const norm=T.norm,words=T.words,animalType=p=>/\bfauna\b/.test(words(p.type))&&!/\bflora\b/.test(words(p.type)),fishing=p=>/\bpesca\b/.test(words(p.type))||p.categories?.includes('fishing');
const forest=/\b(?:madeiras?|toras?|lenha|carvao vegetal|produtos? florestal|serraria|desmatamento|vegetacao|supressao|flora)\b/,generic=/\b(?:flora e fauna|fauna e flora|flora ou fauna|fauna ou flora)\b/g;
const direct=/\b(?:cacar|caca predatoria|captur\w* (?:de )?(?:animais|aves|especimes|peixes)|(?:manter|guardar|transportar|vender|comercializar|exportar|importar|matar|perseguir|apanhar)\b.{0,100}\b(?:fauna silvestre|animais? silvestres?|aves silvestres?|especimes? da fauna)|maus tratos (?:a|de|contra) animais)\b/;
const recover=[],review=[],summary=[],unresolved=new Map(),allNames=new Set(),oldNames=new Set();
const sourceNames=p=>T.allItems(p).filter(x=>!T.plantItem(x)).flatMap(x=>T.itemNames(x));
function classify(p){const o=p.official||{},items=T.allItems(p),doc=words(o.infraction_description||p.description).replace(generic,' '),detail=words(o.narrative_detail).replace(generic,' '),animal=items.some(x=>!T.plantItem(x)&&(T.animalItem(x)||T.itemNames(x).some(n=>T.verified(n)))),flora=items.some(T.plantItem),forestry=forest.test(doc);
 if(animal)return ['recover','documented_animal_specimen_or_verified_taxon'];
 if(animalType(p)&&!forestry&&!flora)return ['recover','official_fauna_type'];
 if((direct.test(doc)||direct.test(detail))&&!forestry)return ['recover','direct_fauna_conduct'];
 if(fishing(p))return ['review','fishing_scope_requires_review'];
 if(T.eligibility(p).ok)return ['review','previous_eligibility_rule_only'];
 if(sourceNames(p).length&&!flora)return ['review','unverified_scientific_name'];
 if(p.audit_previous_candidate)return ['review','previous_candidate_without_direct_evidence'];
 return ['excluded','no_fauna_evidence'];}
function counts(rows){return {notices:rows.length,georeferenced:rows.filter(f=>f.geometry).length,with_species_referenced:rows.filter(f=>f.properties.species_referenced?.length).length,with_seized_specimens:rows.filter(f=>f.properties.seized_specimens?.length).length,with_seizure_terms:rows.filter(f=>f.properties.seizure_terms?.length).length,with_species_name:rows.filter(f=>sourceNames(f.properties).length).length,over_80_items:rows.filter(f=>T.allItems(f.properties).length>80).length};}
for(const y of years){const all=read(full,y),old=read(prior,y),ids=new Set(old.features.map(f=>f.properties.id)),seen=new Set(),r=[],m=[],classification={};
 if(Object.values(all.enrichment_status||{}).some(x=>x!=='ok')||Object.keys(all.enrichment_status||{}).length!==5)throw Error('Incomplete enrichment '+y);
 if(all.features.some(f=>!f.properties.official))throw Error('Unmatched official auto '+y);
 for(const f of old.features)for(const e of T.entries(T.allItems(f.properties)))oldNames.add(e.name);
 for(const f of all.features){const p=f.properties;seen.add(p.id);const existing=ids.has(p.id),[decision,reason]=classify(p),label=decision+':'+reason;classification[label]=(classification[label]||0)+1;
  if(existing||decision==='recover'){for(const e of T.entries(T.allItems(p)))allNames.add(e.name);for(const item of T.allItems(p)){if(T.plantItem(item))continue;for(const n of T.candidateNames(item.scientific_name)){if(T.verified(n))continue;const k=norm(n),v=unresolved.get(k)||{name:n,ids:new Set(),groups:new Set()};v.ids.add(p.id);v.groups.add(item.group||'(sem grupo)');unresolved.set(k,v);}}}
  if(existing||decision==='excluded')continue;const row={id:p.id,year:y,type:p.type,code:p.official?.infraction_code||'',reason,previous_candidate:p.audit_previous_candidate===true,georeferenced:!!f.geometry,scientific_names:sourceNames(p),with_linked_specimens:!!p.seized_specimens?.length};(decision==='recover'?r:m).push(row);
 }
 recover.push(...r);review.push(...m);const s={year:y,all_source_rows:all.stats.records_read,all_valid_autos:all.features.length,published:counts(old.features),full_source:counts(all.features),recovery_candidates:r.length,missed_by_early_filter:r.filter(x=>!x.previous_candidate).length,missed_after_early_filter:r.filter(x=>x.previous_candidate).length,manual_review:m.length,published_ids_absent_from_new_source:[...ids].filter(id=>!seen.has(id)),classification};summary.push(s);console.log('IBAMA_REVIEW_YEAR '+JSON.stringify(s));
}
const totals={source_rows:summary.reduce((s,y)=>s+y.all_source_rows,0),valid_autos:summary.reduce((s,y)=>s+y.all_valid_autos,0),published:summary.reduce((s,y)=>s+y.published.notices,0),recovery_candidates:recover.length,missed_by_early_filter:recover.filter(x=>!x.previous_candidate).length,manual_review:review.length,published_species_with_current_rules:oldNames.size,proposed_species_with_current_rules:allNames.size,additional_species:[...allNames].filter(n=>!oldNames.has(n)).sort(),unresolved_structured_names:unresolved.size};
fs.mkdirSync(out,{recursive:true});for(const [name,value] of Object.entries({'summary':{totals,years:summary},'recovery-candidates':recover,'manual-review':review,'unresolved-species':[...unresolved.values()].map(v=>({name:v.name,records:[...v.ids],groups:[...v.groups]}))}))fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));console.log('IBAMA_REVIEW_TOTAL '+JSON.stringify(totals));
