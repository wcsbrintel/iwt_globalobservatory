const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sandbox=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../case-display.js'),'utf8'),sandbox);
const C=sandbox.window.CaseDisplay;
const row={id:'future-case',localization_schema_version:1};
for(const stem of C.fields)for(const lang of C.languages)row[stem+'_'+lang]=stem+' '+lang;
test('All card values use selected language',()=>{for(const lang of C.languages){const v=C.localize(row,lang);assert.equal(v.species,'fauna_label '+lang);assert.equal(v.taxon,'taxon_text '+lang);assert.equal(v.mode,'modal_label '+lang);assert.equal(v.quantityDisplay,'quantity_label '+lang);assert.equal(v.geoNote,'geographic_note '+lang);}});
test('Missing Spanish translation is rejected',()=>{const v={...row,quantity_label_es:' '};assert.equal(C.validate(v),false);assert.throws(()=>C.localize(v,'en'),/Incomplete/);});
test('No retrospective change to legacy cards',()=>{assert.equal(C.localize({id:'legacy',fauna_label_pt:'Aves'},'en'),null);});
