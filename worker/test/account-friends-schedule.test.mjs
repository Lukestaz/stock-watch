import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createAlpacaObservationSource,createFriendsSchedule,createFriendsRuntime} from '../src/account-friends-runtime.mjs';
import {createAccountWorker} from '../src/account-runtime.mjs';
const origin='https://app.example.invalid',bar=(time,low=9,close=10)=>({t:new Date(time*1000).toISOString(),l:low,c:close});
test('disabled market source never fetches',async()=>{let calls=0;const s=createAlpacaObservationSource({fetcher:()=>calls++});assert.equal((await s.bars({})).length,0);assert.equal(calls,0);});
test('Alpaca source requests one bounded delayed SIP window and normalizes valid bars',async()=>{
 let seen;const s=createAlpacaObservationSource({enabled:true,key:'fake-key',secret:'fake-secret',fetcher:async(url,options)=>{seen={url:new URL(url),options};return Response.json({bars:[bar(1000060),bar(1000000),bar(1001250),bar(1000061,true),bar(999000)]});}});
 const result=await s.bars({symbol:'ABC',after:1000000,now:1001260});assert.deepEqual(Array.from(result,r=>r.observedAt),[1000060]);assert.equal(seen.url.hostname,'data.alpaca.markets');assert.equal(seen.url.searchParams.get('feed'),'sip');assert.equal(seen.url.searchParams.get('timeframe'),'1Min');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.headers['APCA-API-KEY-ID'],'fake-key');
});
test('no source fetch is made before a post-consent delayed bar can exist',async()=>{let calls=0;const s=createAlpacaObservationSource({enabled:true,key:'fake',secret:'fake',fetcher:()=>calls++});assert.equal((await s.bars({symbol:'ABC',after:1001200,now:1001260})).length,0);assert.equal(calls,0);});
test('provider failures, pagination and oversized responses fail closed',async()=>{
 for(const response of [new Response('private details',{status:500}),Response.json({bars:[],next_page_token:'more'}),new Response('x'.repeat(262145))]){
  const s=createAlpacaObservationSource({enabled:true,key:'fake',secret:'fake',fetcher:async()=>response});await assert.rejects(s.bars({symbol:'ABC',after:1000000,now:1001260}));
 }
});
function scheduleFixture(options={}){
 const calls=[];const rows=options.rows||[{symbol:'ABC',after:1000000}];
 const config={enabled:true,db:{prepare:sql=>({bind:(...args)=>({sql,args})}),batch:async statements=>{calls.push('query');assert.ok(statements[0].sql.includes('GROUP BY e.symbol'));return [{success:true,results:rows}];}},source:{configured:true,bars:async value=>{calls.push(['source',value]);return [{symbol:'ABC',low:9,close:9,observedAt:1000120},{symbol:'ABC',low:9,close:9,observedAt:1000060}];}},producer:{evaluate:async value=>{calls.push(['evaluate',value]);return {eventsCreated:1};}},dispatcher:{run:async()=>{calls.push('dispatch');return {accepted:2};}},cleanup:async()=>calls.push('cleanup'),clock:()=>1001260,...options};
 return {calls,job:createFriendsSchedule(config)};
}
test('disabled schedule performs no work',async()=>{const f=scheduleFixture({enabled:false});assert.equal((await f.job.run()).status,'disabled');assert.equal(f.calls.length,0);});
test('schedule fetches once per symbol, evaluates chronologically and dispatches',async()=>{
 const f=scheduleFixture(),r=await f.job.run();assert.equal(r.status,'ok');assert.equal(r.eventsCreated,2);assert.equal(r.accepted,2);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='source').length,1);assert.deepEqual(f.calls.filter(c=>Array.isArray(c)&&c[0]==='evaluate').map(c=>c[1].observedAt),[1000060,1000120]);assert.deepEqual(f.calls.slice(-2),['dispatch','cleanup']);
});
test('market failures produce no new events while prior eligible deliveries may dispatch',async()=>{const f=scheduleFixture({source:{configured:true,bars:async()=>{throw Error('private');}}}),r=await f.job.run();assert.equal(r.status,'partial');assert.equal(r.eventsCreated,0);assert.ok(!f.calls.some(c=>Array.isArray(c)&&c[0]==='evaluate'));assert.equal(r.accepted,2);});
test('symbol cap fails visibly without partial evaluation',async()=>{const f=scheduleFixture({maxSymbols:1,rows:[{symbol:'ABC',after:1},{symbol:'DEF',after:1}]}),r=await f.job.run();assert.equal(r.status,'capacity');assert.equal(f.calls.length,1);});
test('runtime keeps old site routing and never loads friends code with flags off',async()=>{
 let loads=0;const worker=createAccountWorker({compose:()=>({fetch:async()=>new Response('old-site')}),friendsLoader:async()=>{loads++;throw Error();}}),env={};
 assert.equal(await (await worker.fetch(new Request(origin),env)).text(),'old-site');assert.equal((await worker.fetch(new Request(origin+'/api/v1/alert-consent/email'),env)).status,503);assert.equal((await worker.scheduled({},env,{})).status,'disabled');assert.equal(loads,0);
});
test('runtime lazily routes gated email APIs, schedules and public feature booleans',async()=>{
 let loads=0,runs=0;const worker=createAccountWorker({compose:()=>({fetch:async()=>Response.json({ok:true,mode:'account-preview'})}),friendsLoader:async()=>{loads++;return {createFriendsRuntime:async()=>({ready:true,enrollmentEnabled:false,scheduledConfigured:true,fetch:async()=>new Response('friends-api'),scheduled:async()=>{runs++;return {status:'ok'};}})};}});
 const env={ACCOUNTS_ENABLED:'true',FRIENDS_ALERTS_ENABLED:'true',FRIENDS_SCHEDULE_ENABLED:'true'};
 assert.equal(await (await worker.fetch(new Request(origin+'/api/v1/alert-consent/email'),env)).text(),'friends-api');const health=await (await worker.fetch(new Request(origin+'/api/health'),env)).json();assert.deepEqual(health.friendsAlerts,{verificationReady:true,enrollmentAvailable:false,scheduledConfigured:true});let held;assert.equal((await worker.scheduled({},env,{waitUntil:p=>held=p})).status,'ok');await held;assert.equal(runs,1);assert.equal(loads,1);
});
test('failed friends initialization is unavailable rather than breaking the old site',async()=>{const w=createAccountWorker({compose:()=>({fetch:async()=>new Response('old-site')}),friendsLoader:async()=>{throw Error('private');}}),env={ACCOUNTS_ENABLED:'true',FRIENDS_ALERTS_ENABLED:'true'};assert.equal((await w.fetch(new Request(origin+'/api/v1/alert-consent/email'),env)).status,503);assert.equal(await (await w.fetch(new Request(origin),env)).text(),'old-site');});

test('friends factory returns disabled before touching secrets with feature flags off',async()=>{
 const env={get GMAIL_USER(){throw Error('Secret was accessed');}};const service=await createFriendsRuntime({env});assert.equal(service.ready,false);assert.equal((await service.scheduled()).status,'disabled');
});
test('missing private schema prevents socket setup and enrolment',async()=>{
 let sockets=0;const env={ACCOUNTS_ENABLED:'true',FRIENDS_ALERTS_ENABLED:'true',APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture',GMAIL_USER:'sender@example.invalid',GMAIL_APP_PASSWORD:'abcdefghijklmnop',ACCOUNT_LIMIT:{limit:async()=>({success:true})},DB:{prepare:sql=>({bind:()=>({sql})}),batch:async()=>[0,1,2].map(()=>({success:true,results:[]}))}};
 const service=await createFriendsRuntime({env,connect:()=>sockets++});assert.equal(service.ready,false);assert.equal(service.enrollmentEnabled,false);assert.equal(sockets,0);
});

test('real SQL groups two subscribed accounts into one price fetch and excludes inactive revisions',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'friends-schedule-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite'),bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{const c=spawn('python3',[bridge,path,'batch']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});c.stdin.on('error',reject);c.stdin.end(JSON.stringify(statements));})};
 const query=(sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]);
 for(const user of ['u1','u2']){
  await query("INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision,alerts_enabled,email_enabled) VALUES (?,'ABC',10,0,1,1,1)",[user]);
  await query("INSERT INTO alert_destinations(user_id,channel,address,provider,verified_at,enabled) VALUES (?,'email',?,'shared-smtp',999000,1)",[user,user+'@example.invalid']);
  await query("INSERT INTO account_alert_monitors(user_id,symbol,target_revision,consent_revision,enabled_at,last_observed_at) VALUES (?,'ABC',1,1,1000000,1000000)",[user]);
 }
 const fetched=[];const job=createFriendsSchedule({enabled:true,db,source:{configured:true,bars:async value=>{fetched.push(value);return [];}},producer:{evaluate:async()=>{throw Error('Unexpected observation');}},dispatcher:{run:async()=>({accepted:0})},cleanup:async()=>true,clock:()=>1001260});
 assert.equal((await job.run()).symbols,1);assert.equal(fetched.length,1);assert.equal(fetched[0].symbol,'ABC');
 await query("UPDATE watchlist_entries SET email_enabled=0,alerts_enabled=0 WHERE user_id='u1'");await query("UPDATE watchlist_entries SET target_revision=2 WHERE user_id='u2'");assert.equal((await job.run()).symbols,0);assert.equal(fetched.length,1);
});
