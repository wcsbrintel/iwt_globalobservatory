const fs=require('node:fs'),path=require('node:path'),T=require('../../ibama-taxonomy.js');
const dir=process.argv[2],candidates=new Set(),prior=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));T.setRegistry(prior.records);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.json')?[path.join(dir,e.name)]:[]);}
const cases=walk('cases').map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).filter(e=>e.id&&e.taxon_text);
const features=Array.from({length:6},(_,i)=>JSON.parse(fs.readFileSync(path.join(dir,'ibama-'+(2020+i)+'.json'),'utf8')).features).flat();
for(const f of features)for(const x of T.allItems(f.properties))if(!T.plantItem(x))for(const n of T.candidateNames(x.scientific_name))candidates.add(n);
for(const e of cases)for(const n of T.candidateNames(e.taxon_text))candidates.add(n);
const classes={Aves:'Aves',Mammalia:'Mamíferos',Reptilia:'Répteis',Amphibia:'Anfíbios',Actinopterygii:'Peixes',Actinopteri:'Peixes',Chondrichthyes:'Peixes',Elasmobranchii:'Peixes',Holocephali:'Peixes',Myxini:'Peixes',Petromyzonti:'Peixes',Sarcopterygii:'Peixes',Insecta:'Insetos',Arachnida:'Aracnídeos'};
const records={...prior.records},unresolved=[],errors=[];
const jobs=[...candidates].filter(n=>!records[T.norm(n)]).sort();let cursor=0;
async function resolve(name){
 const u=new URL('https://api.gbif.org/v1/species/match');u.search=new URLSearchParams({name,rank:'SPECIES',kingdom:'Animalia',strict:'true'});
 let d;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(u,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'WCS-Brasil-public-taxonomy-audit/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);d=await r.json();break;}catch(e){if(attempt===2){errors.push({name,error:String(e)});return;}await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}
 if(d.matchType!=='EXACT'||d.kingdom!=='Animalia'||d.rank!=='SPECIES'||!['ACCEPTED','SYNONYM'].includes(d.status)||!d.species||!d.usageKey){unresolved.push({name,matchType:d.matchType,rank:d.rank,kingdom:d.kingdom});return;}
 const canonical=T.speciesNames(d.species)[0];if(!canonical){unresolved.push({name,reason:'invalid canonical name'});return;}
 const group=classes[d.class]||(d.phylum==='Chordata'?'Fauna não especificada':'Invertebrados');
 records[T.norm(name)]={name:canonical,group,kingdom:'Animalia',matchType:'EXACT',status:d.status,usageKey:d.usageKey,acceptedUsageKey:d.acceptedUsageKey||d.usageKey,source:'GBIF Backbone Taxonomy',sourceName:name};
}
(async()=>{await Promise.all(Array.from({length:4},async()=>{while(cursor<jobs.length){const n=jobs[cursor++];await resolve(n);}}));
if(errors.length){console.error(JSON.stringify(errors.slice(0,10)));throw Error('External verification incomplete: '+errors.length+' failed requests; preserving prior registry');}
T.setRegistry(records);
const known=new Set();for(const f of features)for(const x of T.allItems(f.properties))if(T.animalItem(x))for(const n of T.itemNames(x))known.add(T.norm(T.canonicalName(n)));
const cat=T.osintCatalog(cases,known),osint=new Set(cases.flatMap(e=>cat.get(e)||[]));for(const n of osint)known.add(T.norm(n));
const official=new Set(); // final coverage computed only after the source eligibility stage
const summary={candidates:candidates.size,new_queries:jobs.length,verified:Object.keys(records).length,unresolved:unresolved.length,osintSpecies:osint.size,ibamaSpecies:official.size,uniqueCombined:new Set([...osint,...official]).size,ibamaNotices:features.length,osintCases:cases.length};
fs.writeFileSync('species-registry.json',JSON.stringify({schema_version:1,source:'GBIF Backbone Taxonomy',generated_at:new Date().toISOString(),summary,records},null,2));
fs.writeFileSync('species-review.json',JSON.stringify({summary,unresolved},null,2));console.log('TAXONOMY VERIFIED '+JSON.stringify(summary));})();
