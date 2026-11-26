import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1AccountAlertStore} from '../src/account-alert-store.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'consent-resume-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const c=spawn('python3',[bridge,path,'batch']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});c.stdin.on('error',reject);c.stdin.end(JSON.stringify(statements));
 })};
 for(const [symbol,position,enabled] of [['ABC',0,1],['DEF',1,1],['XYZ',2,0]])await query(db,'INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision,alerts_enabled,email_enabled) VALUES (?,?,?,?,1,?,?)',['u1',symbol,10,position,enabled,enabled]);
 await query(db,"INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision,alerts_enabled,email_enabled) VALUES ('u2','XYZ',10,0,1,1,1)");
 await query(db,"INSERT INTO alert_destinations(user_id,channel,address,provider,verified_at,enabled) VALUES ('u1','email','one@example.invalid','shared-smtp',999000,0),('u2','email','two@example.invalid','shared-smtp',999000,1)");
 for(const symbol of ['ABC','DEF']){
  await query(db,"INSERT INTO account_alert_monitors(user_id,symbol,target_revision,consent_revision,enabled_at,last_observed_at) VALUES ('u1',?,1,1,1000000,1000060)",[symbol]);
  await query(db,"INSERT INTO account_alert_events(user_id,symbol,target_revision,kind,observed_at,target_usd,low_usd) VALUES ('u1',?,1,'target',1000060,10,9)",[symbol]);
  await query(db,"INSERT INTO account_alert_deliveries(user_id,symbol,target_revision,kind,observed_at,channel,destination_revision,consent_revision) VALUES ('u1',?,1,'target',1000060,'email',1,1)",[symbol]);
 }
 const tables=['watchlists','watchlist_entries','alert_destinations','account_alert_monitors','account_alert_events','account_alert_deliveries'];
 const snapshot=()=>db.batch(tables.map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY user_id').bind())).then(r=>r.map(x=>x.results));
 return {db,snapshot,store:createD1AccountAlertStore(db,{enrollmentEnabled:true})};
}
const consent=(symbol='ABC',enabled=true,revision=0,now=1000200)=>({userId:'u1',symbol,enabled,expectedWatchlistRevision:revision,expectedTargetRevision:1,expectedDestinationRevision:1,now});
test('blocked multi-stock resume leaves the complete private transaction state unchanged',async t=>{
 const f=await fixture(t),before=await f.snapshot();assert.equal(await f.store.setEmailConsent(consent()),null);assert.deepEqual(await f.snapshot(),before);
});
test('enabling a new stock cannot implicitly resume other paused selections',async t=>{
 const f=await fixture(t),before=await f.snapshot();assert.equal(await f.store.setEmailConsent(consent('XYZ')),null);assert.deepEqual(await f.snapshot(),before);
});
test('explicit opt-out permits isolated resume with a fresh baseline and cancelled old delivery',async t=>{
 const f=await fixture(t),otherBefore=await f.store.read('u2');
 assert.deepEqual(await f.store.setEmailConsent(consent('DEF',false)),{revision:1,enabled:false});
 assert.deepEqual(await f.store.setEmailConsent(consent('ABC',true,1,1000300)),{revision:2,enabled:true});
 const m=(await query(f.db,"SELECT consent_revision,enabled_at,last_observed_at FROM account_alert_monitors WHERE user_id='u1' AND symbol='ABC'"))[0];assert.deepEqual(m,{consent_revision:2,enabled_at:1000300,last_observed_at:1000300});
 assert.deepEqual(await query(f.db,"SELECT symbol,status FROM account_alert_deliveries WHERE user_id='u1' ORDER BY symbol"),[{symbol:'ABC',status:'cancelled'},{symbol:'DEF',status:'cancelled'}]);
 assert.equal((await f.store.read('u1')).destination.enabled,true);assert.deepEqual(await f.store.read('u2'),otherBefore);
});
test('an already active destination still permits independent stock opt-in',async t=>{
 const f=await fixture(t);await query(f.db,"UPDATE alert_destinations SET enabled=1 WHERE user_id='u1'");assert.deepEqual(await f.store.setEmailConsent(consent('XYZ')),{revision:1,enabled:true});assert.equal((await f.store.read('u1')).stocks.find(x=>x.symbol==='XYZ').emailEnabled,true);
});
test('concurrent direct resume requests cannot bypass the guard or mutate pending deliveries',async t=>{
 const f=await fixture(t),before=await f.snapshot();assert.deepEqual(await Promise.all([f.store.setEmailConsent(consent('ABC')),f.store.setEmailConsent(consent('XYZ'))]),[null,null]);assert.deepEqual(await f.snapshot(),before);
});
test('a later monitor failure rolls back all earlier changes in an otherwise permitted resume',async t=>{
 const f=await fixture(t);await f.store.setEmailConsent(consent('DEF',false));
 await query(f.db,"CREATE TRIGGER fail_resume BEFORE UPDATE ON account_alert_monitors WHEN NEW.enabled_at=1000300 BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 const before=await f.snapshot();await assert.rejects(f.store.setEmailConsent(consent('ABC',true,1,1000300)));assert.deepEqual(await f.snapshot(),before);
});
