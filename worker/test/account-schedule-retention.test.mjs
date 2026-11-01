import test from 'node:test';
import assert from 'node:assert/strict';
import {createFriendsSchedule} from '../src/account-friends-runtime.mjs';
function fixture({enabled=true,mode='ok',retention='ok'}={}){
 const calls=[];let cleanups=0;
 const job=createFriendsSchedule({enabled,maxSymbols:1,clock:()=>1001260,
  db:{prepare:sql=>({bind:(...args)=>({sql,args})}),batch:async()=>{calls.push('query');if(mode==='query')throw Error('private');if(mode==='malformed')return [];return [{success:true,results:mode==='capacity'?[{symbol:'ABC',after:1},{symbol:'DEF',after:1}]:[{symbol:'ABC',after:1}]}];}},
  source:{configured:true,bars:async()=>{calls.push('source');if(mode==='source')throw Error('private');return [{symbol:'ABC',low:9,close:9,observedAt:1000060}];}},
  producer:{evaluate:async()=>{calls.push('evaluate');if(mode==='evaluate')throw Error('private');return {eventsCreated:1};}},
  dispatcher:{run:async()=>{calls.push('dispatch');if(mode==='dispatch')throw Error('private');return {accepted:0};}},
  cleanup:async()=>{calls.push('cleanup');cleanups++;if(retention==='throw')throw Error('private retention detail');return retention!=='false';}
 });
 return {job,calls,get cleanups(){return cleanups;}};
}
test('disabled schedule does not query, dispatch or clean up',async()=>{const f=fixture({enabled:false});assert.equal((await f.job.run()).status,'disabled');assert.deepEqual(f.calls,[]);});
test('successful schedule cleans up exactly once after dispatch',async()=>{const f=fixture(),r=await f.job.run();assert.equal(r.status,'ok');assert.equal(r.errors,0);assert.equal(f.cleanups,1);assert.deepEqual(f.calls.slice(-2),['dispatch','cleanup']);});
test('capacity skips evaluation and dispatch but still cleans up once',async()=>{const f=fixture({mode:'capacity'}),r=await f.job.run();assert.equal(r.status,'capacity');assert.equal(r.errors,0);assert.equal(f.cleanups,1);assert.deepEqual(f.calls,['query','cleanup']);});
test('query failures and malformed results still run retention',async()=>{for(const mode of ['query','malformed']){const f=fixture({mode}),r=await f.job.run();assert.equal(r.status,'unavailable');assert.equal(r.errors,1);assert.equal(f.cleanups,1);assert.deepEqual(f.calls,['query','cleanup']);}});
test('source and evaluation failures retain partial status and still clean up',async()=>{for(const mode of ['source','evaluate']){const f=fixture({mode}),r=await f.job.run();assert.equal(r.status,'partial');assert.equal(r.errors,1);assert.equal(f.cleanups,1);assert.equal(f.calls.at(-1),'cleanup');}});
test('dispatcher failure still cleans up and remains unavailable',async()=>{const f=fixture({mode:'dispatch'}),r=await f.job.run();assert.equal(r.status,'unavailable');assert.equal(r.errors,1);assert.equal(f.cleanups,1);assert.deepEqual(f.calls.slice(-2),['dispatch','cleanup']);});
test('retention exceptions and false results turn otherwise successful runs partial',async()=>{for(const retention of ['throw','false']){const f=fixture({retention}),r=await f.job.run();assert.equal(r.status,'partial');assert.equal(r.errors,1);assert.equal(f.cleanups,1);assert.ok(!JSON.stringify(r).includes('private'));}});
test('retention failures preserve capacity and unavailable primary statuses',async()=>{for(const [mode,status,errors] of [['capacity','capacity',1],['query','unavailable',2]]){const f=fixture({mode,retention:'throw'}),r=await f.job.run();assert.equal(r.status,status);assert.equal(r.errors,errors);assert.equal(f.cleanups,1);}});
