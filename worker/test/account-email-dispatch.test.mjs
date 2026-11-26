import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1EmailOutbox} from '../src/account-email-outbox.mjs';
import {createAccountEmailDispatcher,formatAccountPriceAlert} from '../src/account-email-dispatcher.mjs';
import {createD1VerificationMailBudget} from '../src/account-verification-mail-budget.mjs';
import {createGmailSmtpTransport} from '../src/account-gmail-smtp.mjs';
import {createGmailFriendsDispatcher} from '../src/account-gmail-friends-dispatcher.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'friends-dispatch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{const c=spawn('python3',[bridge,path,'batch']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});c.stdin.on('error',reject);c.stdin.end(JSON.stringify(statements));})};
 for(const u of ['u1','u2']){
  await query(db,"INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision,alerts_enabled,email_enabled) VALUES (?,'ABC',10,0,1,1,1)",[u]);
  await query(db,"INSERT INTO alert_destinations(user_id,channel,address,provider,verified_at,enabled) VALUES (?,'email',?,'shared-smtp',999000,1)",[u,u+'@example.invalid']);
  await query(db,"INSERT INTO account_alert_monitors(user_id,symbol,target_revision,consent_revision,enabled_at,last_observed_at) VALUES (?,'ABC',1,1,1000000,1000060)",[u]);
  await query(db,"INSERT INTO account_alert_events(user_id,symbol,target_revision,kind,observed_at,target_usd,low_usd) VALUES (?,'ABC',1,'target',1000060,10,9)",[u]);
  await query(db,"INSERT INTO account_alert_deliveries(user_id,symbol,target_revision,kind,observed_at,channel,destination_revision,consent_revision) VALUES (?,'ABC',1,'target',1000060,'email',1,1)",[u]);
 }
 let now=1001260;const sent=[],outbox=createD1EmailOutbox(db,{enabled:true}),reserve=createD1VerificationMailBudget(db,{userDaily:10,destinationDaily:10,cooldownSeconds:30},{purpose:'price-alert'});
 const settings={enabled:true,outbox,reserve,send:async message=>{sent.push(message);return {outcome:'accepted'};},from:'sender@example.invalid',clock:()=>now};
 return {db,outbox,reserve,sent,settings,dispatcher:createAccountEmailDispatcher(settings),setTime:message=>now=message};
}
test('disabled dispatcher never touches storage or provider',async()=>{
 let n=0;const d=createAccountEmailDispatcher({send:()=>n++});assert.equal((await d.run()).accepted,0);assert.equal(n,0);
});
test('two accounts receive distinct addressed alerts and outcomes are persisted',async t=>{
 const f=await fixture(t);assert.equal((await f.dispatcher.run()).accepted,2);assert.deepEqual(f.sent.map(m=>m.to).sort(),['u1@example.invalid','u2@example.invalid']);assert.ok(f.sent.every(m=>m.text.includes('Observed low: $9.00')&&m.text.includes('not a live or executable quote')));
 assert.deepEqual((await query(f.db,'SELECT status FROM account_alert_deliveries')).map(r=>r.status),['accepted','accepted']);assert.equal((await f.dispatcher.run()).accepted,0);assert.equal(f.sent.length,2);
});
test('concurrent workers cannot send the same delivery twice',async t=>{
 const f=await fixture(t);await Promise.all([f.dispatcher.run(),f.dispatcher.run()]);assert.equal(f.sent.length,2);
});
test('opt-out after claim but before handoff prevents sending',async t=>{
 const f=await fixture(t),claim=await f.outbox.claim(1001260);await query(f.db,'UPDATE watchlist_entries SET email_enabled=0,alerts_enabled=0 WHERE user_id=?',[claim.userId]);assert.equal(await f.outbox.start(claim.claimToken,1001261),null);
});
test('changed destination or consent revision blocks the final handoff',async t=>{
 for(const update of ["UPDATE alert_destinations SET address='new@example.invalid' WHERE user_id=?","UPDATE account_alert_monitors SET consent_revision=2 WHERE user_id=?"]){const f=await fixture(t),c=await f.outbox.claim(1001260);await query(f.db,update,[c.userId]);assert.equal(await f.outbox.start(c.claimToken,1001261),null);}
});
test('a claim cannot authorize provider handoff twice',async t=>{
 const f=await fixture(t),c=await f.outbox.claim(1001260);assert.ok(await f.outbox.start(c.claimToken,1001261));assert.equal(await f.outbox.start(c.claimToken,1001261),null);
});
test('expired pre-send lease can be reclaimed and old worker loses authority',async t=>{
 const f=await fixture(t),c=await f.outbox.claim(1001260);await f.outbox.claim(1001400);assert.equal(await f.outbox.start(c.claimToken,1001400),null);
});
test('expired post-handoff lease becomes unknown and is never requeued',async t=>{
 const f=await fixture(t),c=await f.outbox.claim(1001260);await f.outbox.start(c.claimToken,1001261);await f.outbox.claim(1001400);assert.equal((await query(f.db,'SELECT status FROM account_alert_deliveries WHERE user_id=?',[c.userId]))[0].status,'outcome_unknown');
});
test('budget-denied account does not block another account',async t=>{
 const f=await fixture(t),d=createAccountEmailDispatcher({...f.settings,reserve:async value=>value.userId==='u2'});const r=await d.run();assert.equal(r.deferred,1);assert.equal(r.accepted,1);assert.equal(f.sent[0].to,'u2@example.invalid');
});
test('provider exceptions record unknown outcome without retries',async t=>{
 const f=await fixture(t);let calls=0;const d=createAccountEmailDispatcher({...f.settings,send:async()=>{calls++;throw Error('private transport detail');}});assert.equal((await d.run()).uncertain,2);assert.equal(calls,2);await d.run();assert.equal(calls,2);
 assert.ok(!JSON.stringify(await query(f.db,'SELECT last_error_category FROM account_alert_deliveries')).includes('private'));
});
test('explicit pre-send failure has bounded attempts; accepted is terminal',async t=>{
 const f=await fixture(t),d=createAccountEmailDispatcher({...f.settings,reserve:async()=>true,send:async()=>({outcome:'not_sent'})});await d.run({limit:10});assert.deepEqual((await query(f.db,'SELECT status,attempts FROM account_alert_deliveries')).map(r=>[r.status,r.attempts]),[['failed',3],['failed',3]]);
});
test('expired or unverified pending deliveries are not claimed',async t=>{
 const f=await fixture(t);await query(f.db,'UPDATE alert_destinations SET enabled=0,verified_at=NULL');assert.equal(await f.outbox.claim(1001260),null);assert.equal(f.sent.length,0);
});
test('verification and alerts have separate personal allowances but share global capacity',async t=>{
 const f=await fixture(t),dest='a'.repeat(64),verify=createD1VerificationMailBudget(f.db,{globalDaily:2,userDaily:1,destinationDaily:1,cooldownSeconds:0}),price=createD1VerificationMailBudget(f.db,{globalDaily:2,userDaily:1,destinationDaily:1,cooldownSeconds:0},{purpose:'price-alert'});
 assert.equal(await verify({userId:'u1',destinationHash:dest,now:1001260}),true);assert.equal(await price({userId:'u1',destinationHash:dest,now:1001260}),true);assert.equal(await price({userId:'u2',destinationHash:'b'.repeat(64),now:1001260}),false);
});
test('formatter distinguishes near from reached and rejects invalid prices',()=>{
 assert.ok(formatAccountPriceAlert({symbol:'ABC',kind:'near',observedAt:1000060,target:10,low:10.4}).text.includes('near target'));
 assert.throws(()=>formatAccountPriceAlert({symbol:'ABC',kind:'target',observedAt:1000060,target:10,low:11}));
});

test('friends dispatcher runs the concrete SMTP protocol only for account-bound recipients',async t=>{
 const f=await fixture(t),wire=[];
 const connect=(address,options)=>{
  assert.equal(address.hostname,'smtp.gmail.com');assert.equal(options.secureTransport,'on');let c,closed=false;
  const reply=s=>{if(!closed)c.enqueue(new TextEncoder().encode(s));};
  const readable=new ReadableStream({start(value){c=value;reply('220 ready\r\n');}});
  const writable=new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);if(text.startsWith('EHLO'))reply('250-test\r\n250 AUTH PLAIN\r\n');else if(text.startsWith('AUTH'))reply('235 ok\r\n');else if(text.startsWith('MAIL')||text.startsWith('RCPT'))reply('250 ok\r\n');else if(text==='DATA\r\n')reply('354 continue\r\n');else if(text.endsWith('\r\n.\r\n')){wire.push(text);reply('250 accepted\r\n');}}});
  return {opened:Promise.resolve(),closed:Promise.resolve(),readable,writable,close(){if(!closed){closed=true;try{c.close();}catch{}}return Promise.resolve();}};
 };
 const d=createGmailFriendsDispatcher({enabled:true,db:f.db,connect,username:'sender@example.invalid',appPassword:'abcdefghijklmnop',clock:()=>1001260,timeoutMs:1000});
 assert.equal((await d.run()).accepted,2);assert.equal(wire.length,2);assert.ok(wire.some(s=>s.includes('To: u1@example.invalid')));assert.ok(wire.some(s=>s.includes('To: u2@example.invalid')));assert.ok(wire.every(s=>s.includes('Subject: [Stock Watch] Price alert')));
});
test('verification SMTP purpose cannot accidentally send price alerts',async()=>{
 let calls=0;const smtp=createGmailSmtpTransport({enabled:true,connect:()=>calls++,username:'sender@example.invalid',appPassword:'abcdefghijklmnop'});
 const result=await smtp.send({from:'sender@example.invalid',to:'friend@example.invalid',subject:'[Stock Watch] Price alert',text:'price'});assert.equal(result.outcome,'not_sent');assert.equal(calls,0);
});
test('outcome-record failure after provider acceptance is not automatically resent',async t=>{
 const f=await fixture(t);await query(f.db,"CREATE TRIGGER fail_outcome BEFORE UPDATE OF status ON account_alert_deliveries WHEN NEW.status='accepted' BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 await assert.rejects(f.dispatcher.run({limit:1}));assert.equal(f.sent.length,1);await query(f.db,'DROP TRIGGER fail_outcome');f.setTime(1001400);await f.dispatcher.run();assert.equal(f.sent.length,2);
 assert.ok((await query(f.db,'SELECT status FROM account_alert_deliveries')).some(r=>r.status==='outcome_unknown'));
});
