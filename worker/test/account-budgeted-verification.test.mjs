import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {SESSION_COOKIE,tokenHash} from '../src/account-identity.mjs';
import {createBudgetedAlertDestinationApi} from '../src/account-budgeted-verification.mjs';
globalThis.crypto ??= webcrypto;
const origin='https://app.example.invalid',root='/v1/alert-destination/email',raw={u1:'a'.repeat(43),u2:'b'.repeat(43)};
const req=(body,user='u1',path=root,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...(user?{Cookie:SESSION_COOKIE+'='+raw[user]}:{}),...headers},body:JSON.stringify(body)});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'budgeted-verification-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
  child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 for(const user of ['u1','u2'])await query(db,'INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,1000000,1000000,2000000)',[await tokenHash(raw[user]),user]);
 let now=1000000;const sent=[];
 const config={enabled:true,allowedOrigin:origin,db,clientId:'test-client',loadGoogleKeys:async()=>{throw Error('Unexpected Google fetch');},admit:async()=>true,limit:async()=>true,from:'sender@example.invalid',send:async message=>{sent.push(message);return {outcome:'accepted'};},clock:()=>now,...options};
 return {db,api:createBudgetedAlertDestinationApi(config),sent,setTime:value=>now=value,config};
}
const code=message=>message.text.match(/\b[a-f0-9]{64}\b/)[0];
const count=async db=>(await query(db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n;
test('default disabled and invalid sender/configuration have no side effects',async()=>{
 let calls=0;const db={prepare:()=>{calls++;throw Error();},batch:()=>{calls++;throw Error();}};
 for(const options of [{},{enabled:true,from:'bad\r\nBcc:a@example.invalid'}]){
  const api=createBudgetedAlertDestinationApi({db,allowedOrigin:origin,send:()=>calls++,...options});assert.equal((await api(req({address:'a@example.invalid'}))).status,503);
 }
 assert.equal(calls,0);
});
test('complete session-to-template flow reserves exactly once and verification stays opted out',async t=>{
 const f=await fixture(t),r=await f.api(req({address:'alice@example.invalid'}));assert.equal(r.status,202);assert.deepEqual(await r.json(),{ok:true});assert.equal(f.sent.length,1);assert.equal(await count(f.db),1);
 assert.equal(f.sent[0].from,'sender@example.invalid');assert.equal(f.sent[0].subject,'[Stock Watch] Verify your email address');
 const token=code(f.sent[0]);assert.equal((await query(f.db,'SELECT challenge_hash FROM alert_email_challenges'))[0].challenge_hash,await tokenHash(token));
 const result=await f.api(req({token},'u1',root+'/verify'));assert.equal(result.status,200);assert.deepEqual(await result.json(),{verified:true,alertsEnabled:false});
 assert.deepEqual(await query(f.db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:1000000,enabled:0}]);assert.equal(await count(f.db),1);
});
test('two real sessions have separate destinations, codes and quota ownership',async t=>{
 const f=await fixture(t);assert.equal((await f.api(req({address:'alice@example.invalid'}))).status,202);assert.equal((await f.api(req({address:'bob@example.invalid'},'u2'))).status,202);
 assert.equal((await f.api(req({token:code(f.sent[0])},'u2',root+'/verify'))).status,400);
 assert.equal((await f.api(req({token:code(f.sent[1])},'u2',root+'/verify'))).status,200);
 assert.deepEqual(await query(f.db,'SELECT user_id FROM verification_mail_reservations ORDER BY user_id'),[{user_id:'u1'},{user_id:'u2'}]);
});
test('quota-denied resend preserves the previously mailed challenge and destination',async t=>{
 const f=await fixture(t);await f.api(req({address:'alice@example.invalid'}));const token=code(f.sent[0]);
 assert.equal((await f.api(req({address:'changed@example.invalid'}))).status,503);assert.equal(f.sent.length,1);assert.equal(await count(f.db),1);
 assert.equal((await query(f.db,'SELECT address FROM alert_destinations'))[0].address,'alice@example.invalid');
 assert.equal((await f.api(req({token},'u1',root+'/verify'))).status,200);
});
test('quota denial also leaves an already verified destination intact',async t=>{
 const f=await fixture(t);await f.api(req({address:'alice@example.invalid'}));await f.api(req({token:code(f.sent[0])},'u1',root+'/verify'));
 assert.equal((await f.api(req({address:'new@example.invalid'}))).status,503);
 assert.deepEqual(await query(f.db,'SELECT address,verified_at,enabled FROM alert_destinations'),[{address:'alice@example.invalid',verified_at:1000000,enabled:0}]);
});
test('concurrent registration at a one-slot cap sends at most one message',async t=>{
 const f=await fixture(t,{limits:{globalDaily:1,cooldownSeconds:0}});
 const results=await Promise.all([f.api(req({address:'alice@example.invalid'})),f.api(req({address:'bob@example.invalid'},'u2'))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[202,503]);assert.equal(f.sent.length,1);assert.equal(await count(f.db),1);assert.equal((await query(f.db,'SELECT user_id FROM alert_email_challenges')).length,1);
});
test('provider rejection or uncertainty keeps quota charged and returns generic errors',async t=>{
 for(const outcome of ['failed','outcome_unknown','throw']){
  let calls=0;const f=await fixture(t,{send:async()=>{calls++;if(outcome==='throw')throw Error('secret provider detail');return {outcome};}});
  const r=await f.api(req({address:'alice@example.invalid'}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Destination service unavailable'});
  assert.equal((await f.api(req({address:'alice@example.invalid'}))).status,503);assert.equal(calls,1);assert.equal(await count(f.db),1);
  assert.deepEqual(await query(f.db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:null,enabled:0}]);
 }
});
test('storage failure after reservation never sends and does not refund the reservation',async t=>{
 const f=await fixture(t);await query(f.db,"CREATE TRIGGER fail_begin BEFORE INSERT ON alert_email_challenges BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 assert.equal((await f.api(req({address:'alice@example.invalid'}))).status,503);assert.equal(f.sent.length,0);assert.equal(await count(f.db),1);
 assert.deepEqual(await query(f.db,'SELECT user_id FROM alert_destinations'),[]);
});
test('invalid session, origin and admission do not reserve or send',async t=>{
 const f=await fixture(t);assert.equal((await f.api(req({address:'alice@example.invalid'},null))).status,401);
 assert.equal((await f.api(req({address:'alice@example.invalid'},'u1',root,{Origin:'https://evil.invalid'}))).status,403);
 const blocked=createBudgetedAlertDestinationApi({...f.config,admit:async()=>false});assert.equal((await blocked(req({address:'alice@example.invalid'}))).status,429);
 assert.equal(await count(f.db),0);assert.equal(f.sent.length,0);
});
test('a permitted later resend supersedes its earlier code without double charging',async t=>{
 const f=await fixture(t);await f.api(req({address:'alice@example.invalid'}));const first=code(f.sent[0]);f.setTime(1000060);
 assert.equal((await f.api(req({address:'new@example.invalid'}))).status,202);assert.equal(await count(f.db),2);
 assert.equal((await f.api(req({token:first},'u1',root+'/verify'))).status,400);
 assert.equal((await f.api(req({token:code(f.sent[1])},'u1',root+'/verify'))).status,200);
});
test('verification expiry and concurrent consumption do not allocate additional send budget',async t=>{
 const f=await fixture(t);await f.api(req({address:'alice@example.invalid'}));const old=code(f.sent[0]);f.setTime(1000600);
 assert.equal((await f.api(req({token:old},'u1',root+'/verify'))).status,400);
 await f.api(req({address:'alice@example.invalid'}));const token=code(f.sent[1]);
 const results=await Promise.all([f.api(req({token},'u1',root+'/verify')),f.api(req({token},'u1',root+'/verify'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(await count(f.db),2);
});
