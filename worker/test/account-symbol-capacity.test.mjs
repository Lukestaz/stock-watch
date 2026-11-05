import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1AccountAlertStore,ACCOUNT_EMAIL_SYMBOL_LIMIT} from '../src/account-alert-store.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,reserved=20){
 const dir=mkdtempSync(join(tmpdir(),'symbol-capacity-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const c=spawn('python3',[bridge,path,'batch']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});c.stdin.on('error',reject);c.stdin.end(JSON.stringify(statements));
 })};
 const entry=(user,symbol,position,enabled)=>db.prepare('INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision,alerts_enabled,email_enabled) VALUES (?,?,10,?,1,?,?)').bind(user,symbol,position,enabled,enabled);
 const entries=Array.from({length:reserved},(_,i)=>entry('u1','S'+String(i).padStart(2,'0'),i,1));
 entries.push(entry('u1','NEW1',reserved,0),entry('u2','NEW2',0,0),entry('u2','NEW1',1,0),entry('u2','S00',2,0));
 await db.batch(entries);
 await query(db,"INSERT INTO alert_destinations(user_id,channel,address,provider,verified_at,enabled) VALUES ('u1','email','one@example.invalid','shared-smtp',999000,1),('u2','email','two@example.invalid','shared-smtp',999000,0)");
 const tables=['watchlists','watchlist_entries','alert_destinations','account_alert_monitors','account_alert_events','account_alert_deliveries'];
 const snapshot=()=>db.batch(tables.map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY user_id').bind())).then(r=>r.map(x=>x.results));
 const count=async()=>(await query(db,'SELECT count(DISTINCT symbol) AS n FROM watchlist_entries WHERE email_enabled=1'))[0].n;
 return {db,entry,snapshot,count,store:createD1AccountAlertStore(db,{enrollmentEnabled:true})};
}
const consent=(userId='u1',symbol='NEW1',enabled=true,revision=0)=>({userId,symbol,enabled,expectedWatchlistRevision:revision,expectedTargetRevision:1,expectedDestinationRevision:1,now:1000200});
test('twentieth distinct symbol can be admitted',async t=>{
 assert.equal(ACCOUNT_EMAIL_SYMBOL_LIMIT,20);const f=await fixture(t,19);assert.deepEqual(await f.store.setEmailConsent(consent()),{revision:1,enabled:true});assert.equal(await f.count(),20);
});
test('twenty-first distinct symbol is rejected without any consent transaction changes',async t=>{
 const f=await fixture(t),before=await f.snapshot();assert.equal(await f.store.setEmailConsent(consent()),null);assert.deepEqual(await f.snapshot(),before);assert.equal(await f.count(),20);
});
test('another account can subscribe to an already reserved symbol at capacity',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.store.setEmailConsent(consent('u2','S00')),{revision:1,enabled:true});assert.equal(await f.count(),20);assert.equal((await f.store.read('u2')).stocks.find(x=>x.symbol==='S00').emailEnabled,true);
});
test('paused and unverified destinations keep selected-symbol reservations',async t=>{
 const f=await fixture(t);await query(f.db,"UPDATE alert_destinations SET enabled=0,verified_at=NULL WHERE user_id='u1'");const before=await f.snapshot();assert.equal(await f.store.setEmailConsent(consent('u2','NEW2')),null);assert.deepEqual(await f.snapshot(),before);assert.equal(await f.count(),20);
});
test('a shared symbol slot is released only after its last account opts out',async t=>{
 const f=await fixture(t);await f.store.setEmailConsent(consent('u2','S00'));await f.store.setEmailConsent(consent('u1','S00',false));assert.equal(await f.count(),20);
 assert.equal(await f.store.setEmailConsent(consent('u2','NEW2',true,1)),null);
 assert.deepEqual(await f.store.setEmailConsent(consent('u2','S00',false,1)),{revision:2,enabled:false});assert.equal(await f.count(),19);
 assert.deepEqual(await f.store.setEmailConsent(consent('u2','NEW2',true,2)),{revision:3,enabled:true});assert.equal(await f.count(),20);
});
test('concurrent different-symbol opt-ins cannot both take the last slot',async t=>{
 const f=await fixture(t,19),results=await Promise.all([f.store.setEmailConsent(consent()),f.store.setEmailConsent(consent('u2','NEW2'))]);assert.equal(results.filter(Boolean).length,1);assert.equal(await f.count(),20);
 const loser=results[0]===null?'u1':'u2';assert.equal((await f.store.read(loser)).revision,0);assert.deepEqual(await query(f.db,'SELECT symbol FROM account_alert_monitors WHERE user_id=?',[loser]),[]);
});
test('concurrent same-symbol subscriptions share the last slot across accounts',async t=>{
 const f=await fixture(t,19),results=await Promise.all([f.store.setEmailConsent(consent()),f.store.setEmailConsent(consent('u2','NEW1'))]);assert.equal(results.filter(Boolean).length,2);assert.equal(await f.count(),20);
});
test('a rolled-back opt-in does not consume the last symbol reservation',async t=>{
 const f=await fixture(t,19);await query(f.db,"CREATE TRIGGER fail_capacity_monitor BEFORE INSERT ON account_alert_monitors WHEN NEW.symbol='NEW1' BEGIN SELECT RAISE(ABORT,'synthetic'); END");const before=await f.snapshot();
 await assert.rejects(f.store.setEmailConsent(consent()));assert.deepEqual(await f.snapshot(),before);assert.equal(await f.count(),19);
 assert.deepEqual(await f.store.setEmailConsent(consent('u2','NEW2')),{revision:1,enabled:true});assert.equal(await f.count(),20);
});
test('opt-out is allowed even for an already over-capacity database',async t=>{
 const f=await fixture(t,21);assert.deepEqual(await f.store.setEmailConsent(consent('u1','S00',false)),{revision:1,enabled:false});assert.equal(await f.count(),20);
});
