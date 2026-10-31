import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1AccountAlertStore} from '../src/account-alert-store.mjs';
import {createAccountAlertConsentApi} from '../src/account-alert-consent-api.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'account-alert-producer-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 for(const [u,target] of [['u1',10],['u2',8]]){
  await query(db,"INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision) VALUES (?,'ABC',?,0,1)",[u,target]);
  await query(db,"INSERT INTO alert_destinations(user_id,channel,address,provider,verified_at) VALUES (?,'email',?,'shared-smtp',999000)",[u,u+'@example.invalid']);
 }
 return {db,store:createD1AccountAlertStore(db,{enrollmentEnabled:true,evaluationEnabled:true,...options})};
}
const consent=(userId='u1',enabled=true,expectedWatchlistRevision=0,now=1000000)=>({userId,symbol:'ABC',enabled,expectedWatchlistRevision,expectedTargetRevision:1,expectedDestinationRevision:1,now});
const observation=(low=9,close=9,observedAt=1000060)=>({symbol:'ABC',low,close,observedAt,now:observedAt+1200});
test('default gates do not enable consent or evaluate observations',async()=>{
 let calls=0;const store=createD1AccountAlertStore({prepare:()=>calls++,batch:()=>calls++});await assert.rejects(store.setEmailConsent(consent()));assert.deepEqual(await store.evaluate(observation()),{processed:0,eventsCreated:0,deliveriesCreated:0});assert.equal(calls,0);
});
test('consent requires current verified destination and revision preconditions',async t=>{
 const {db,store}=await fixture(t);await query(db,"UPDATE alert_destinations SET verified_at=NULL WHERE user_id='u1'");assert.equal(await store.setEmailConsent(consent()),null);
 await query(db,"UPDATE alert_destinations SET verified_at=999000 WHERE user_id='u1'");assert.equal(await store.setEmailConsent({...consent(),expectedDestinationRevision:2}),null);
 assert.deepEqual(await store.setEmailConsent(consent()),{revision:1,enabled:true});assert.equal(await store.setEmailConsent(consent()),null);
});
test('read and consent updates are isolated and WhatsApp is never enabled',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());assert.equal((await store.read('u1')).stocks[0].emailEnabled,true);assert.equal((await store.read('u2')).stocks[0].emailEnabled,false);
 assert.deepEqual(await query(db,'SELECT whatsapp_enabled FROM watchlist_entries ORDER BY user_id'),[{whatsapp_enabled:0},{whatsapp_enabled:0}]);
});
test('one shared observation evaluates distinct per-user targets',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.setEmailConsent(consent('u2'));
 const result=await store.evaluate(observation());assert.equal(result.processed,2);assert.equal(result.eventsCreated,1);assert.equal(result.deliveriesCreated,1);
 assert.deepEqual(await query(db,'SELECT user_id,kind FROM account_alert_events'),[{user_id:'u1',kind:'target'}]);
});
test('repeated bars and concurrent runs do not duplicate an armed event',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());const results=await Promise.all([store.evaluate(observation()),store.evaluate(observation())]);assert.equal(results.reduce((n,r)=>n+r.eventsCreated,0),1);
 await store.evaluate(observation(9,9,1000120));assert.equal((await query(db,'SELECT count(*) AS n FROM account_alert_events'))[0].n,1);
});
test('target alerts rearm only after the close rises above the rearm threshold',async t=>{
 const {store}=await fixture(t);await store.setEmailConsent(consent());await store.evaluate(observation());assert.equal((await store.evaluate(observation(9,9,1000120))).eventsCreated,0);
 await store.evaluate(observation(10.3,10.3,1000180));assert.equal((await store.evaluate(observation(9,9,1000240))).eventsCreated,1);
});
test('near then target events have distinct kinds without repeated near spam',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());assert.equal((await store.evaluate(observation(10.4,10.4))).eventsCreated,1);assert.equal((await store.evaluate(observation(10.4,10.4,1000120))).eventsCreated,0);assert.equal((await store.evaluate(observation(9,9,1000180))).eventsCreated,1);
 assert.deepEqual((await query(db,'SELECT kind FROM account_alert_events ORDER BY observed_at')).map(r=>r.kind),['near','target']);
});
test('opt-out cancels only that accounts pending email and prevents further events',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.setEmailConsent(consent('u2'));await store.evaluate(observation(7,7));
 await store.setEmailConsent(consent('u1',false,1,1000100));assert.deepEqual(await query(db,'SELECT user_id,status FROM account_alert_deliveries ORDER BY user_id'),[{user_id:'u1',status:'cancelled'},{user_id:'u2',status:'pending'}]);
 await store.evaluate(observation(7,7,1000180));assert.equal((await query(db,"SELECT count(*) AS n FROM account_alert_events WHERE user_id='u1'"))[0].n,1);
});
test('opt-out remains possible after the destination loses verification',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await query(db,"UPDATE alert_destinations SET address='new@example.invalid' WHERE user_id='u1'");
 assert.deepEqual(await store.setEmailConsent(consent('u1',false,1,1000100)),{revision:2,enabled:false});
});
test('observations before consent, too fresh or stale cannot create events',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());
 for(const value of [{...observation(),observedAt:999900,now:1001100},{...observation(),now:1000100},{...observation(),now:1005000}])assert.equal((await store.evaluate(value)).eventsCreated,0);
 assert.deepEqual(await query(db,'SELECT user_id FROM account_alert_events'),[]);
});
test('invalid bars are rejected before storage mutation',async t=>{
 const {store}=await fixture(t);for(const change of [{low:true},{low:NaN},{low:11,close:10},{observedAt:0}])await assert.rejects(store.evaluate({...observation(),...change}));
});
test('reenrolment does not replay old observations or revive cancelled delivery',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.evaluate(observation());await store.setEmailConsent(consent('u1',false,1,1000100));await store.setEmailConsent(consent('u1',true,2,1000200));
 assert.equal((await store.evaluate(observation())).eventsCreated,0);assert.equal((await store.evaluate(observation(9,9,1000260))).eventsCreated,1);
 assert.deepEqual((await query(db,'SELECT status FROM account_alert_deliveries ORDER BY observed_at')).map(r=>r.status),['cancelled','pending']);
});
test('destination changes and target revision changes supersede pending events',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.evaluate(observation());await query(db,"UPDATE alert_destinations SET address='new@example.invalid' WHERE user_id='u1'");assert.equal(await store.invalidatePending(1001300),1);
 assert.equal((await query(db,'SELECT status FROM account_alert_deliveries'))[0].status,'superseded');await query(db,"UPDATE watchlist_entries SET target_revision=2 WHERE user_id='u1'");assert.equal((await store.evaluate(observation(9,9,1000180))).eventsCreated,0);
});
test('pending events expire without being sent',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.evaluate(observation());await store.invalidatePending(1010000);assert.equal((await query(db,'SELECT status FROM account_alert_deliveries'))[0].status,'expired');
});
test('event failure rolls back monitor claim and permits a clean retry',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await query(db,"CREATE TRIGGER fail_event BEFORE INSERT ON account_alert_events BEGIN SELECT RAISE(ABORT,'synthetic'); END");await assert.rejects(store.evaluate(observation()));
 assert.equal((await query(db,'SELECT last_observed_at FROM account_alert_monitors'))[0].last_observed_at,1000000);await query(db,'DROP TRIGGER fail_event');assert.equal((await store.evaluate(observation())).eventsCreated,1);
});
test('consent transaction errors roll back watchlist revision and opt-in',async t=>{
 const {db,store}=await fixture(t);await query(db,"CREATE TRIGGER fail_monitor BEFORE INSERT ON account_alert_monitors BEGIN SELECT RAISE(ABORT,'synthetic'); END");await assert.rejects(store.setEmailConsent(consent()));assert.equal((await store.read('u1')).revision,0);assert.equal((await store.read('u1')).stocks[0].emailEnabled,false);
});
const body={symbol:'ABC',enabled:true,expectedWatchlistRevision:0,expectedTargetRevision:1,expectedDestinationRevision:1};
const request=(value=body,account='u1')=>new Request('https://app.example.invalid/v1/alert-consent/email',{method:'PUT',headers:{Origin:'https://app.example.invalid','Content-Type':'application/json','X-Watchlist-Account':account},body:JSON.stringify(value)});
function routeFixture(options={}){
 const calls=[];return {calls,api:createAccountAlertConsentApi({enabled:true,enrollmentEnabled:true,allowedOrigin:'https://app.example.invalid',authenticate:async()=>({userId:'u1'}),admit:async()=>true,limit:async()=>true,store:{read:async()=>({revision:0}),setEmailConsent:async value=>{calls.push(value);return {revision:1,enabled:value.enabled};}},clock:()=>1000000,...options})};
}
test('consent API derives account identity and never accepts a client user ID',async()=>{
 const f=routeFixture();assert.equal((await f.api(request())).status,200);assert.equal(f.calls[0].userId,'u1');assert.equal((await f.api(request({...body,userId:'u2'}))).status,400);assert.equal((await f.api(request(body,'u2'))).status,409);assert.equal(f.calls.length,1);
});
test('enrolment gate rejects opt-in but permits opt-out',async()=>{
 const f=routeFixture({enrollmentEnabled:false});assert.equal((await f.api(request())).status,409);assert.equal((await f.api(request({...body,enabled:false,expectedDestinationRevision:null}))).status,200);
});
test('anonymous and limited consent requests never reach storage',async()=>{
 for(const options of [{authenticate:async()=>null},{admit:async()=>false},{limit:async()=>false}]){const f=routeFixture(options);assert.ok([401,429].includes((await f.api(request())).status));assert.equal(f.calls.length,0);}
});

test('opting out of one symbol does not disable another symbol on the same destination',async t=>{
 const {db,store}=await fixture(t);await query(db,"INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision) VALUES ('u1','DEF',10,1,1)");
 await store.setEmailConsent(consent());await store.setEmailConsent({...consent('u1',true,1),symbol:'DEF'});await store.setEmailConsent(consent('u1',false,2,1000100));
 assert.equal((await query(db,"SELECT enabled FROM alert_destinations WHERE user_id='u1'"))[0].enabled,1);
 assert.equal((await store.evaluate({...observation(9,9,1000180),symbol:'DEF'})).eventsCreated,1);
});
test('a changed consent revision supersedes pending delivery eligibility',async t=>{
 const {db,store}=await fixture(t);await store.setEmailConsent(consent());await store.evaluate(observation());await query(db,"UPDATE account_alert_monitors SET consent_revision=consent_revision+1 WHERE user_id='u1'");
 assert.equal(await store.invalidatePending(1001300),1);assert.equal((await query(db,'SELECT status FROM account_alert_deliveries'))[0].status,'superseded');
});
