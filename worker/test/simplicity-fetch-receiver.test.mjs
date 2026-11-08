import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSimplicityHistory} from '../src/simplicity-fetch.mjs';
const fund={seriesId:'simplicity:kiwisaver:high-growth',verificationStatus:'verified',feedUrl:'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth'};
test('default fetch preserves global receiver in receiver-sensitive runtimes',async t=>{
 const original=globalThis.fetch; let calls=0;
 t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async function(url,options){
  assert.equal(this,globalThis,'global fetch receiver was lost');
  assert.equal(new URL(url).origin,'https://simplicity.kiwi');assert.equal(options.redirect,'error');assert.ok(options.signal);calls++;
  return new Response('Date,Price\n04-11-2026,1.25',{headers:{'Content-Type':'text/csv'}});
 };
 const result=await fetchSimplicityHistory(fund,{now:()=>new Date('2026-11-08T10:00:00Z')});
 assert.equal(calls,1);assert.equal(result.latest.price,1.25);assert.equal(result.latest.asOfDate,'2026-11-04');assert.equal(result.alertEligible,false);
});
test('explicit fetch injection still works and never calls global fetch',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});globalThis.fetch=()=>{throw Error('Global fetch should not run');};
 const result=await fetchSimplicityHistory(fund,{fetchImpl:async()=>new Response('Date,Price\n04-11-2026,1.5'),now:()=>new Date('2026-11-08T10:00:00Z')});
 assert.equal(result.latest.price,1.5);
});
