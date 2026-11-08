import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSimplicityHistory } from '../src/simplicity-fetch.mjs';
const fund={seriesId:'simplicity:kiwisaver:high-growth',verificationStatus:'verified',feedUrl:'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth'};
const csv=()=>new Response('Date,Price\n02-11-2026,1.25',{headers:{'content-type':'text/csv'}});
test('fetch timestamp never implies observation freshness',async()=>{
  const result=await fetchSimplicityHistory(fund,{fetchImpl:async(url,options)=>{assert.equal(options.redirect,'manual');assert.ok(options.signal);return csv();},now:()=>new Date('2026-11-07T09:00:00Z')});
  assert.equal(result.latest.asOfDate,'2026-11-02');assert.equal(result.fetchedAt,'2026-11-07T09:00:00.000Z');assert.equal(result.freshness,'unchecked');assert.equal(result.alertEligible,false);
});
test('rejects unverified mappings and foreign hosts before fetching',async()=>{
  const fetchImpl=async()=>{throw new Error('Must not fetch');};
  await assert.rejects(fetchSimplicityHistory({...fund,verificationStatus:'unverified'},{fetchImpl}),/Verified/);
  await assert.rejects(fetchSimplicityHistory({...fund,feedUrl:'https://example.com/api/download_prices?fund_name=Growth'},{fetchImpl}),/Invalid feed/);
});
test('rejects HTTP failures, HTML, malformed and oversized bodies',async()=>{
  for(const response of [new Response('unavailable',{status:503}),new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),new Response('Date,Price\n31-02-2026,1.2'),new Response('x'.repeat(2000001))])await assert.rejects(fetchSimplicityHistory(fund,{fetchImpl:async()=>response}));
});
test('manual redirect is rejected rather than followed',async()=>{
  let calls=0;await assert.rejects(fetchSimplicityHistory(fund,{fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://example.com/foreign.csv'}});}}),/Feed HTTP 302/);assert.equal(calls,1);
});
test('default fetch is called with the global receiver',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{globalThis.fetch=function(url,options){calls++;assert.equal(this,globalThis);assert.equal(options.redirect,'manual');return Promise.resolve(csv());};const result=await fetchSimplicityHistory(fund);assert.equal(result.latest.price,1.25);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
