import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSimplicityHistory } from '../src/simplicity-fetch.mjs';
const fund={seriesId:'simplicity:kiwisaver:high-growth',verificationStatus:'verified',feedUrl:'https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/highgrowth.csv'};
const csv=()=>new Response('Date,Price\n02-11-2026,1.25',{headers:{'content-type':'text/csv'}});
test('fetch timestamp never implies observation freshness',async()=>{
  const result=await fetchSimplicityHistory(fund,{fetchImpl:async(url,options)=>{assert.equal(options.redirect,'manual');assert.ok(options.signal);return csv();},now:()=>new Date('2026-11-07T09:00:00Z')});
  assert.equal(result.latest.asOfDate,'2026-11-02');assert.equal(result.fetchedAt,'2026-11-07T09:00:00.000Z');assert.equal(result.freshness,'unchecked');assert.equal(result.alertEligible,false);
});
test('rejects unverified mappings, foreign hosts, the retired endpoint, odd paths and decorated URLs before fetching',async()=>{
  const fetchImpl=async()=>{throw new Error('Must not fetch');};
  await assert.rejects(fetchSimplicityHistory({...fund,verificationStatus:'unverified'},{fetchImpl}),/Verified/);
  for(const feedUrl of [
    'https://example.com/unit-prices/highgrowth.csv',
    'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth',
    'https://d1g0vrcwq8cgqg.cloudfront.net/other/highgrowth.csv',
    'https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/highgrowth.csv?x=1',
    'https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/highgrowth.csv#frag',
    'https://user:pass@d1g0vrcwq8cgqg.cloudfront.net/unit-prices/highgrowth.csv',
    'https://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/../highgrowth.csv',
    'http://d1g0vrcwq8cgqg.cloudfront.net/unit-prices/highgrowth.csv'
  ])await assert.rejects(fetchSimplicityHistory({...fund,feedUrl},{fetchImpl}),/Invalid feed/);
});
test('accepts the published layout with a blank line after every sixth row',async()=>{
  const body='Date,Price\n02-05-2023,1\n03-05-2023,0.9945\n04-05-2023,0.9917\n05-05-2023,0.9972\n08-05-2023,0.9972\n09-05-2023,0.9952\n\n10-05-2023,0.9977\n';
  const result=await fetchSimplicityHistory(fund,{fetchImpl:async()=>new Response(body,{headers:{'content-type':'text/csv'}})});
  assert.equal(result.history.length,7);assert.equal(result.latest.asOfDate,'2023-05-10');
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
