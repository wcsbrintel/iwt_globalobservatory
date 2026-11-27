const assert=require('node:assert/strict');const C=require('../prospective-core.js');
const mk=(id,day,country='A')=>({id,day,country,groups:['Birds'],mode:'air',countable:true});
const rows=[mk('1','2025-01-05'),mk('2','2025-02-01'),mk('3',null),mk('1','2025-01-05'),{...mk('4','2025-02-01'),countable:false}];
const a=C.analyze({rows,visible:rows,history:12,now:'2025-03-15',edges:[{eventId:'1',from:'A',to:'B',direction:'forward'},{eventId:'1',from:'A',to:'B',direction:'forward'}]});
assert.equal(a.total,3);assert.equal(a.historyCount,2);assert.equal(a.undated,1);assert.equal(a.route.pairs[0].n,1);assert.equal(a.forecast,null);assert.equal(a.months.length,2);
const months=Array.from({length:36},(_,i)=>({key:(2022+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0'),n:10}));
const f=C.forecast(months,90);assert.equal(f.estimates.length,3);assert.equal(f.estimates[0].n,10);assert.equal(f.mae,0);assert.equal(C.forecast(months.slice(0,10),30),null);
console.log('Prospective core tests passed');
