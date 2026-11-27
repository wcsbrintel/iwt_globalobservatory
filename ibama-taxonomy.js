/* Conservative fauna eligibility and individual scientific species identities. */
(function(root,factory){const p=factory();if(typeof module==='object'&&module.exports)module.exports=p;else root.IbamaTaxonomy=p;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const words=x=>norm(x).replace(/[^a-z0-9]+/g,' ').trim();
const animal=/\b(?:fauna|animais?|animalia|aves?|birds?|mammalia|mamiferos?|mammals?|repteis|reptil|reptilia|reptiles?|anfibios?|amphibia|amphibians?|peixes?|fish|pisces|actinopterygii|chondrichthyes|invertebrados?|insects?|insetos?|insecta|aracnideos?|arachnida|crustaceos?|crustacea|malacostraca|gastropoda|bivalvia|cephalopoda|elasmobranchii|osteichthyes|sarcopterygii|passeriformes|psittaciformes|testudines|squamata|crocodylia|crocodilia|primates|carnivora|rodentia|chiroptera|annelida|artr[oó]podes|arthropoda|moluscos?|mollusca|cnidaria|equinodermos?|echinodermata)\b/;
const plant=/\b(?:flora|plantas?|plantae|vegetais?|vegetal|arvores?|madeiras?|fungos?|fungi|algas?|botanica|angiospermas?|gimnospermas?|forestal|florestal)\b/;
const wood=/^(?:m\s*3|m³|metro[s]?\s+cubico[s]?|st|estereo[s]?)$/i;
const forest=/\b(?:madeira[s]?|toras?|lenha|carvao vegetal|produto[s]? florestal|produtos florestais|origem florestal|serraria|desmatamento|vegetacao|flora|supressao|arvores?|exploracao florestal)\b/;
const direct=/\b(?:animais? silvestres?|animais? da fauna|especimes? da fauna|fauna silvestre|caca predatoria|cacar|apanhar animais|capturar animais|comercio de animais|maus tratos (?:a|de|contra) animais|aves silvestres?|passaros silvestres?|animais? nativos?)\b/;
const generic=/\b(?:flora e fauna|fauna e flora|flora ou fauna|fauna ou flora|flora flora|fauna flora|flora fauna)\b/g;
const clean=x=>words(x).replace(generic,' ');
const stop=new Set(['spp','sp','cf','aff','indet','unknown','species','specie','specimens','especies','silvestre','silvestres','diversos','diversas','domestico','domestica','domesticos','domesticas','nao','not','unidentified','nativa','nativo','e','and','or','ou','de','da','do','dos','das','em','por','the','common','wild']);
function binomial(genus,epithet){if(stop.has(genus.toLowerCase())||stop.has(epithet.toLowerCase()))return '';return genus[0].toUpperCase()+genus.slice(1).toLowerCase()+' '+epithet.toLowerCase();}
function speciesNames(value){
 // A structured scientific-name field may include author/year, a subspecies, or multiple full names.
 // Never infer an abbreviated genus, hybrid, cf./aff. identification, or a genus-only record.
 const result=new Set(),raw=String(value??'').normalize('NFKC').replace(/\*/g,'').trim();
 for(let part of raw.split(/\s*(?:;|\/|\||\n|,(?=\s*[A-Z][a-z]+\s+[a-z]))\s*/)){
  part=part.trim().replace(/^\d+\s*(?:x\s*)?/i,'').replace(/\s+/g,' ');
  if(!part||/\b(?:cf|aff)\.?\s|[×]|\bhybrid\b/i.test(part))continue;
  const m=/^([A-Za-z]{2,}) ([A-Za-z][A-Za-z-]{1,})(?=$|[\s,(])/.exec(part);
  if(!m)continue;
  const rest=part.slice(m[0].length).trim();
  // A residual third epithet (subspecies) or nomenclatural author is permitted; arbitrary prose is not.
  if(rest&&!/^(?:[a-z][a-z-]{1,}(?:\s+(?:\(?[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*(?:[, ]+\d{4})?\)?|\(?\d{4}\)?))?|(?:\(?[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*(?:[, ]+\d{4})?\)?|\(?\d{4}\)?))$/.test(rest))continue;
  const n=binomial(m[1],m[2]);if(n)result.add(n);
 }
 return [...result];
}
function markedNames(value){
 const out=new Set();
 for(const m of String(value??'').matchAll(/(?<!\*)\*([^*\r\n]+)\*(?!\*)/g))for(const n of speciesNames(m[1]))out.add(n);
 return [...out];
}
function osintCatalog(rows,known=new Set()){
 const genera=new Set(),names=new WeakMap();
 for(const n of known){const g=String(n).split(' ')[0];if(g)genera.add(g.toLowerCase());}
 for(const e of rows)for(const n of markedNames(e.taxon_text||e.taxon))genera.add(n.split(' ')[0].toLowerCase());
 for(const e of rows){
  const raw=String(e.taxon_text||e.taxon||''),found=new Set(markedNames(raw));
  // Unmarked names are recovered only with corroborated genera, not arbitrary two-word phrases.
  for(const m of raw.replace(/\*[^*\r\n]+\*/g,' ').matchAll(/\b([A-Z][a-z]+|[A-Z]{2,})\s+([a-z][a-z-]+|[A-Z]{2,})\b/g)){
   const before=raw; // The marked parser handles explicit uncertain IDs separately.
   if(!genera.has(m[1].toLowerCase())||stop.has(m[2].toLowerCase()))continue;
   const n=binomial(m[1],m[2]);if(n)found.add(n);
  }
  names.set(e,[...found]);
 }
 return names;
}
function plantItem(x){return plant.test(words(x?.group))||wood.test(norm(x?.unit));}
function animalItem(x){return animal.test(words(x?.group))&&!plantItem(x);}
function allItems(p){return [...(p.species_referenced||[]),...(p.seized_specimens||[])];}
function eligibility(p){
 const o=p.official||{},type=words(o.administrative_class||p.type),desc=clean(o.infraction_description||p.description),detail=clean(o.narrative_detail),items=allItems(p);
 const official=/\bfauna\b/.test(type)&&!plant.test(type),positive=items.some(animalItem),forestry=forest.test(desc)||forest.test(detail)&&items.some(plantItem),conduct=direct.test(desc)||direct.test(detail);
 if(positive)return {ok:true,reason:'documented_animal_specimen'};
 if(forestry&&!conduct)return {ok:false,reason:'forest_only_or_generic_legal_reference'};
 if(official&&!forestry)return {ok:true,reason:'official_fauna_class'};
 if(conduct&&!forestry)return {ok:true,reason:'direct_fauna_conduct'};
 return {ok:false,reason:forestry?'mixed_or_forest_without_animal_evidence':'no_direct_fauna_evidence'};
}
function common(value){const a=String(value??'').trim().split(/\s*[,;\/|]\s*/)[0]?.trim()||'';return a.length>=2&&a.length<=80&&!/\d|[()[\]{}]/.test(a)&&!(/^[A-Z][a-z]+ [a-z][a-z-]+$/.test(a)&&/^[A-Z][a-z]+ [a-z]+(?:ensis|icus|ina|inus|us|ae|ii|orum|arum)$/.test(a))&&!/^(?:fauna|animal|animais|ave|aves|peixe|peixes|reptil|repteis|mamifero|mamiferos|nao informado|desconhecido|unknown|sem identificacao|indeterminado|especime|outros?)$/i.test(words(a))?a:'';}
function entries(items,known=new Set()){const out=new Map();for(const item of items||[]){if(plantItem(item))continue;const names=speciesNames(item.scientific_name);for(const name of names){const key=norm(name);if(!animalItem(item)&&!known.has(key))continue;const alias=names.length===1?common(item.common_name):'';if(!out.has(key)||!out.get(key).common&&alias)out.set(key,{key,name,common:alias});}}return [...out.values()];}
return Object.freeze({norm,words,speciesNames,markedNames,osintCatalog,animalItem,plantItem,eligibility,entries,common,allItems});
});
