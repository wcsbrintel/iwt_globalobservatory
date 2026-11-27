const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{}});
for(const file of ['ibama-taxonomy.js','species-registry.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
const T=context.window.IbamaTaxonomy;
test('Verified registry is loaded before adapter even without network',()=>{assert.ok(context.window.ObservatoryTaxonomySnapshot.summary.verified>=809);const x=T.entries([{scientific_name:'Prionace glauca',common_name:'Tubarão-azul',group:''}]);assert.equal(x[0].name,'Prionace glauca');assert.equal(x[0].group,'Peixes');});
test('Unmarked OSINT names can be recovered from exact registry',()=>{const e={taxon_text:'Prionace glauca'};assert.ok(T.osintCatalog([e]).get(e).includes('Prionace glauca'));});
test('Explicit flora classification stays excluded',()=>{assert.equal(T.entries([{scientific_name:'Prionace glauca',group:'FLORA'}]).length,0);});
