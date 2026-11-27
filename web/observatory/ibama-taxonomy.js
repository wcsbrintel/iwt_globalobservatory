/* Conservative fauna eligibility and individual scientific species identities. */
(function(root,factory){const p=factory();if(typeof module==='object'&&module.exports)module.exports=p;else root.IbamaTaxonomy=p;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const words=x=>norm(x).replace(/[^a-z0-9]+/g,' ').trim();
const animal=/\b(?:fauna|animais?|animalia|aves?|birds?|mammalia|mamiferos?|mammals?|repteis|reptil|reptilia|reptiles?|anfibios?|amphibia|amphibians?|peixes?|fish|pisces|actinopterygii|chondrichthyes|invertebrados?|insects?|insetos?|insecta|aracnideos?|arachnida|crustaceos?|crustacea|moluscos?|mollusca|cnidaria|equinodermos?|echinodermata)\b/;
const plant=/\b(?:flora|plantas?|plantae|vegetais?|vegetal|arvores?|madeiras?|fungos?|fungi|algas?|botanica|angiospermas?|gimnospermas?|forestal|florestal)\b/;
const wood=/^(?:m\s*3|m³|metro[s]?\s+cubico[s]?|st|estereo[s]?)$/i;
const forest=/\b(?:madeira[s]?|toras?|lenha|carvao vegetal|produto[s]? florestal|produtos florestais|origem florestal|serraria|desmatamento|vegetacao|flora|supressao|arvores?|exploracao florestal)\b/;
const direct=/\b(?:animais? silvestres?|animais? da fauna|especimes? da fauna|fauna silvestre|caca predatoria|cacar|apanhar animais|capturar animais|comercio de animais|maus tratos (?:a|de|contra) animais|aves silvestres?|passaros silvestres?|animais? nativos?)\b/;
const generic=/\b(?:flora e fauna|fauna e flora|flora ou fauna|fauna ou flora|flora flora|fauna flora|flora fauna)\b/g;
const clean=x=>words(x).replace(generic,' ');
function speciesNames(value){
 const result=[];
 for(const part of String(value??'').trim().replace(/\*/g,'').split(/\s*(?:;|\/|\||,|\n)\s*/)){
 const m=/^([A-Z][a-z]{2,}) ([a-z][a-z-]{2,})(?: ([a-z][a-z-]{2,}))?$/.exec(part.trim());
 if(!m||['spp','sp','cf','aff','indet','unknown','species','specie'].includes(m[2])||m[3]&&['spp','sp','cf','aff','indet'].includes(m[3]))continue;
 result.push(m[1]+' '+m[2]);}return [...new Set(result)];
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
function common(value){const a=String(value??'').trim().split(/\s*[,;\/|]\s*/)[0]?.trim()||'';return a.length>=2&&a.length<=80&&!/\d|[()[\]{}]/.test(a)&&!speciesNames(a).length&&!/^(?:fauna|animal|animais|ave|aves|peixe|peixes|reptil|repteis|mamifero|mamiferos|nao informado|desconhecido|unknown|sem identificacao|indeterminado|especime|outros?)$/i.test(words(a))?a:'';}
function entries(items,known=new Set()){const out=new Map();for(const item of items||[]){if(plantItem(item))continue;const names=speciesNames(item.scientific_name);for(const name of names){const key=norm(name);if(!animalItem(item)&&!known.has(key))continue;const alias=names.length===1?common(item.common_name):'';if(!out.has(key)||!out.get(key).common&&alias)out.set(key,{key,name,common:alias});}}return [...out.values()];}
return Object.freeze({norm,words,speciesNames,animalItem,plantItem,eligibility,entries,common,allItems});
});
