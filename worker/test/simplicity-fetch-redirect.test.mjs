import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSimplicityHistory} from '../src/simplicity-fetch.mjs';
const fund={seriesId:'simplicity:kiwisaver:high-growth',verificationStatus:'verified',feedUrl:'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth'};
test('uses the redirect mode supported by the observed Worker runtime',async()=>{
 let calls=0;
 const result=await fetchSimplicityHistory(fund,{fetchImpl:async(url,options)=>{
  if(!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
  assert.equal(options.redirect,'manual');calls++;
  return new Response('Date,Price\n04-11-2026,1.25',{headers:{'Content-Type':'text/csv'}});
 },now:()=>new Date('2026-11-09T00:00:00Z')});
 assert.equal(calls,1);assert.equal(result.latest.price,1.25);assert.equal(result.latest.asOfDate,'2026-11-04');assert.equal(result.alertEligible,false);
});
for(const status of [301,302,303,307,308])test('refuses HTTP '+status+' without following Location',async()=>{
 let calls=0;
 await assert.rejects(fetchSimplicityHistory(fund,{fetchImpl:async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  return new Response(null,{status,headers:{Location:'https://example.invalid/unapproved'}});
 }}),new RegExp('Feed HTTP '+status));
 assert.equal(calls,1);
});
