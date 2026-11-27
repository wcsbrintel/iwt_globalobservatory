const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),T=require('../ibama-taxonomy.js');
const dir=process.argv[2],registry=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
T.setRegistry(registry.records);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.json')?[path.join(dir,e.name)]:[]);}
const osint=walk('cases').map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).filter(e=>e.id&&e.taxon_text);
const official=Array.from({length:6},(_,i)=>JSON.parse(fs.readFileSync(path.join(dir,'ibama-'+(2020+i)+'.json'),'utf8')).features).flat().filter(f=>T.eligibility(f.properties).ok);
const known=new Set();for(const f of official)for(const x of T.allItems(f.properties))if(T.animalItem(x))for(const n of T.itemNames(x))known.add(T.norm(T.canonicalName(n)));
const cat=T.osintCatalog(osint,known);for(const e of osint)for(const n of cat.get(e)||[])known.add(T.norm(n));
const index=new Map();
function add(name,common,source,id,group){const key=T.norm(name);let x=index.get(key);if(!x){x={key,name,common:'',osint:new Set(),ibama:new Set(),group:group||T.verified(name)?.group||''};index.set(key,x);}if(common&&!x.common)x.common=common;x[source].add(id);}
for(const f of official)for(const e of T.entries(T.allItems(f.properties),known))add(e.name,e.common,'ibama',f.properties.id,e.group);
for(const e of osint)for(const name of cat.get(e)||[]){const raw=String(e.taxon_text||'').replace(/\*/g,''),i=raw.indexOf(name),alias=i>=0?/^\s*\(([^()]{2,80})\)/.exec(raw.slice(i+name.length))?.[1]||'':'';const common=/\b(?:especie|espécie|potencial|apreendid|identific|exemplar|individ|suspeit|nenhum|possivel|possível|provavel|provável|not|reported|seized|species)\w*/i.test(alias)?'':T.common(alias);add(name,common,'osint',e.id);}
const target=index.get('prionace glauca');assert.ok(target,'Prionace glauca not associated with any source');console.log('PRIONACE_SOURCE '+JSON.stringify({name:target.name,common:target.common,ibama:[...target.ibama],osint:[...target.osint]}));
const records=[...index.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({key:x.key,name:x.name,common:x.common,group:x.group,osint:x.osint.size,ibama:x.ibama.size}));
const summary={records:records.length,osint:records.filter(x=>x.osint).length,ibama:records.filter(x=>x.ibama).length,sourceNotices:official.length,sourceCases:osint.length};
console.log('SPECIES_INDEX '+JSON.stringify(summary));
fs.writeFileSync('species-index.json',JSON.stringify({schema_version:1,summary,records},null,2));
