import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {SESSION_COOKIE,tokenHash} from '../src/account-identity.mjs';
import {createSessionAlertDestinationApi} from '../src/account-alert-destination-integration.mjs';
globalThis.crypto ??= webcrypto;
const origin='https://app.example.invalid',root='/v1/alert-destination/email';
const raw={u1:'a'.repeat(43),u2:'b'.repeat(43)};
const request=(body,user='u1',path=root,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(user?{Cookie:SESSION_COOKIE+'='+raw[user]}:{}),...headers},body:JSON.stringify(body)});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'alert-session-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
  child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 for(const user of ['u1','u2'])await query(db,'INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,1000000,1000000,2000000)',[await tokenHash(raw[user]),user]);
 let now=1000000;const mail=[],limited=[];
 const api=createSessionAlertDestinationApi({enabled:true,allowedOrigin:origin,db,clientId:'test-client',loadGoogleKeys:async()=>{throw Error('Unexpected Google request');},admit:async()=>true,limit:async(request,user,path)=>{limited.push({user,path});return true;},sendVerification:async message=>{mail.push(message);return true;},clock:()=>now,...options});
 return {db,api,mail,limited,setTime:value=>now=value};
}
test('disabled construction and invalid configuration do not query or send',async()=>{
 let calls=0;const db={prepare:()=>{calls++;throw Error();},batch:()=>{calls++;throw Error();}};
 for(const enabled of [false,true]){
  const api=createSessionAlertDestinationApi({enabled,db,allowedOrigin:origin});
  assert.equal((await api(request({address:'a@example.invalid'}))).status,503);
 }
 assert.equal(calls,0);
});
test('real session, routes and SQL verify only the requesting account without opt-in',async t=>{
 const f=await fixture(t),r=await f.api(request({address:'alice@example.invalid'}));assert.equal(r.status,202);assert.deepEqual(await r.json(),{ok:true});
 assert.equal(f.mail.length,1);const token=f.mail[0].token;
 const c=(await query(f.db,'SELECT user_id,challenge_hash FROM alert_email_challenges'))[0];assert.equal(c.user_id,'u1');assert.notEqual(c.challenge_hash,token);
 const verified=await f.api(request({token},'u1',root+'/verify'));assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{verified:true,alertsEnabled:false});
 assert.deepEqual(await query(f.db,'SELECT user_id,verified_at,enabled FROM alert_destinations'),[{user_id:'u1',verified_at:1000000,enabled:0}]);
 assert.deepEqual(f.limited.map(v=>v.user),['u1','u1']);
});
test('another valid session cannot consume the first accounts token',async t=>{
 const f=await fixture(t);await f.api(request({address:'alice@example.invalid'}));
 assert.equal((await f.api(request({token:f.mail[0].token},'u2',root+'/verify'))).status,400);
 assert.equal((await query(f.db,'SELECT consumed_at FROM alert_email_challenges'))[0].consumed_at,null);
 await f.api(request({address:'bob@example.invalid'},'u2'));
 assert.deepEqual(await query(f.db,'SELECT user_id,address FROM alert_destinations ORDER BY user_id'),[{user_id:'u1',address:'alice@example.invalid'},{user_id:'u2',address:'bob@example.invalid'}]);
});
test('missing, forged and duplicate cookies cannot register a destination',async t=>{
 const f=await fixture(t);
 for(const Cookie of ['',SESSION_COOKIE+'='+'z'.repeat(43),SESSION_COOKIE+'='+raw.u1+'; '+SESSION_COOKIE+'='+raw.u2])assert.equal((await f.api(request({address:'a@example.invalid'},null,root,{Cookie}))).status,401);
 assert.equal(f.mail.length,0);assert.equal(f.limited.length,0);assert.deepEqual(await query(f.db,'SELECT user_id FROM alert_destinations'),[]);
});
test('expired and idle-expired real sessions fail before destination access',async t=>{
 const f=await fixture(t);await query(f.db,"UPDATE sessions SET created_at=999999,expires_at=1000000 WHERE user_id='u1'");
 assert.equal((await f.api(request({address:'a@example.invalid'}))).status,401);
 await query(f.db,"UPDATE sessions SET expires_at=2000000,created_at=1,last_seen_at=1 WHERE user_id='u1'");
 assert.equal((await f.api(request({address:'a@example.invalid'}))).status,401);assert.equal(f.mail.length,0);
});
test('origin, admission and per-account limits stop registration',async t=>{
 const f=await fixture(t);assert.equal((await f.api(request({address:'a@example.invalid'},'u1',root,{Origin:'https://evil.invalid'}))).status,403);
 for(const options of [{admit:async()=>false},{limit:async()=>false}]){
  const blocked=await fixture(t,options);assert.equal((await blocked.api(request({address:'a@example.invalid'}))).status,429);assert.equal(blocked.mail.length,0);
  assert.deepEqual(await query(blocked.db,'SELECT user_id FROM alert_destinations'),[]);
 }
});
test('client account headers do not override cookie identity and extra fields fail',async t=>{
 const f=await fixture(t);assert.equal((await f.api(request({address:'alice@example.invalid'},'u1',root,{'X-User-Id':'u2'}))).status,202);
 assert.deepEqual(await query(f.db,'SELECT user_id FROM alert_destinations'),[{user_id:'u1'}]);
 assert.equal((await f.api(request({address:'new@example.invalid',userId:'u2'}))).status,400);assert.equal(f.mail.length,1);
});
test('combined flow enforces expiry and concurrent one-time consumption',async t=>{
 const f=await fixture(t);await f.api(request({address:'alice@example.invalid'}));const old=f.mail[0].token;
 f.setTime(1000600);assert.equal((await f.api(request({token:old},'u1',root+'/verify'))).status,400);
 await f.api(request({address:'alice@example.invalid'}));const token=f.mail[1].token;
 const results=await Promise.all([f.api(request({token},'u1',root+'/verify')),f.api(request({token},'u1',root+'/verify'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal((await f.api(request({token},'u1',root+'/verify'))).status,400);
});
test('mail failure returns no private details and leaves destination disabled',async t=>{
 const f=await fixture(t,{sendVerification:async()=>{throw Error('private credential detail');}}),r=await f.api(request({address:'alice@example.invalid'}));
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Destination service unavailable'});
 assert.deepEqual(await query(f.db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:null,enabled:0}]);
});
test('revoking the real session blocks verification of its previously issued token',async t=>{
 const f=await fixture(t);await f.api(request({address:'alice@example.invalid'}));await query(f.db,"DELETE FROM sessions WHERE user_id='u1'");
 assert.equal((await f.api(request({token:f.mail[0].token},'u1',root+'/verify'))).status,401);
 assert.equal((await query(f.db,'SELECT verified_at FROM alert_destinations'))[0].verified_at,null);
});
