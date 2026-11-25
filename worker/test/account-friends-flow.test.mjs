import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {SESSION_COOKIE,tokenHash} from '../src/account-identity.mjs';
import {createGmailVerificationService} from '../src/account-gmail-verification-service.mjs';
import {createD1AccountAlertStore} from '../src/account-alert-store.mjs';
import {createGmailFriendsDispatcher} from '../src/account-gmail-friends-dispatcher.mjs';
globalThis.crypto ??= webcrypto;
const origin='https://app.example.invalid',emailPath='/v1/alert-destination/email',consentPath='/v1/alert-consent/email';
const session={u1:'a'.repeat(43),u2:'b'.repeat(43)};
const request=(path,user='u1',method='GET',body,expected=user)=>new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(user?{Cookie:SESSION_COOKIE+'='+session[user]}:{}),...(expected?{'X-Watchlist-Account':expected}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,{enrollmentEnabled=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'friends-complete-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const c=spawn('python3',[bridge,path,'batch']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});c.stdin.on('error',reject);c.stdin.end(JSON.stringify(statements));
 })};
 for(const [user,target] of [['u1',10],['u2',8]]){
  await query(db,'INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,1000000,1000000,2000000)',[await tokenHash(session[user]),user]);
  await query(db,"INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision) VALUES (?,'ABC',?,0,1)",[user,target]);
 }
 let now=1000000;const wire=[];
 const connect=(address,options)=>{
  assert.equal(address.hostname,'smtp.gmail.com');assert.equal(address.port,465);assert.equal(options.secureTransport,'on');let controller,closed=false;
  const reply=s=>{if(!closed)controller.enqueue(new TextEncoder().encode(s));};
  const readable=new ReadableStream({start(c){controller=c;reply('220 ready\r\n');}});
  const writable=new WritableStream({write(bytes){
   const text=new TextDecoder().decode(bytes);
   if(text.startsWith('EHLO'))reply('250-test\r\n250 AUTH PLAIN\r\n');else if(text.startsWith('AUTH'))reply('235 authenticated\r\n');else if(text.startsWith('MAIL')||text.startsWith('RCPT'))reply('250 ok\r\n');else if(text==='DATA\r\n')reply('354 continue\r\n');
   else if(text.endsWith('\r\n.\r\n')){const parts=text.split('\r\n\r\n');wire.push({to:text.match(/^To: (.+)\r?$/m)[1].trim(),subject:text.match(/^Subject: (.+)\r?$/m)[1].trim(),text:Buffer.from(parts[1].split('\r\n.\r\n')[0].replaceAll('\r\n',''),'base64').toString('utf8')});reply('250 accepted\r\n');}
  }});
  return {readable,writable,opened:Promise.resolve(),closed:Promise.resolve(),close(){if(!closed){closed=true;try{controller.close();}catch{}}return Promise.resolve();}};
 };
 const common={enabled:true,db,connect,username:'sender@example.invalid',appPassword:'abcdefghijklmnop',timeoutMs:1000,clock:()=>now};
 const service=createGmailVerificationService({...common,enrollmentEnabled,allowedOrigin:origin,clientId:'test-client',loadGoogleKeys:async()=>{throw Error('Unexpected Google request');},admissionKey:()=> 'trusted-test-edge'});
 return {db,wire,service,producer:createD1AccountAlertStore(db,{evaluationEnabled:true}),dispatcher:createGmailFriendsDispatcher(common),setTime:value=>now=value};
}
async function verify(f,user,address){
 assert.equal((await f.service.fetch(request(emailPath,user,'POST',{address}))).status,202);
 const code=f.wire.at(-1).text.match(/\b[a-f0-9]{64}\b/)[0];assert.equal(f.wire.at(-1).to,address);
 const result=await f.service.fetch(request(emailPath+'/verify',user,'POST',{token:code}));assert.equal(result.status,200);assert.deepEqual(await result.json(),{verified:true,alertsEnabled:false});
}
async function consent(f,user,enabled){
 const r=await f.service.fetch(request(consentPath,user));assert.equal(r.status,200);const value=await r.json();
 return f.service.fetch(request(consentPath,user,'PUT',{symbol:'ABC',enabled,expectedWatchlistRevision:value.revision,expectedTargetRevision:value.stocks[0].targetRevision,expectedDestinationRevision:value.destination?.revision??null}));
}
test('two accounts verify, opt in, evaluate and receive only their own price alerts; opt-out stops later alerts',async t=>{
 const f=await fixture(t);await verify(f,'u1','friend-one@example.invalid');await verify(f,'u2','friend-two@example.invalid');
 assert.equal((await consent(f,'u1',true)).status,200);assert.equal((await consent(f,'u2',true)).status,200);
 f.setTime(1001260);assert.equal((await f.producer.evaluate({symbol:'ABC',low:7,close:7,observedAt:1000060,now:1001260})).deliveriesCreated,2);
 assert.equal((await f.dispatcher.run()).accepted,2);const prices=f.wire.filter(x=>x.subject==='[Stock Watch] Price alert');assert.equal(prices.length,2);
 assert.ok(prices.find(x=>x.to==='friend-one@example.invalid').text.includes('Your target: $10.00'));assert.ok(prices.find(x=>x.to==='friend-two@example.invalid').text.includes('Your target: $8.00'));
 assert.equal((await f.dispatcher.run()).accepted,0);assert.equal(f.wire.length,4);
 const off=await f.service.fetch(request(consentPath,'u1','PUT',{symbol:'ABC',enabled:false,expectedWatchlistRevision:1,expectedTargetRevision:1,expectedDestinationRevision:1}));assert.equal(off.status,200);
 f.setTime(1001380);await f.producer.evaluate({symbol:'ABC',low:8.3,close:8.3,observedAt:1000120,now:1001380});await f.producer.evaluate({symbol:'ABC',low:7,close:7,observedAt:1000180,now:1001380});assert.equal((await f.dispatcher.run()).accepted,1);
 const last=f.wire.at(-1);assert.equal(last.to,'friend-two@example.invalid');assert.equal(last.subject,'[Stock Watch] Price alert');
});
test('real session consent never enables an unverified destination',async t=>{
 const f=await fixture(t);const r=await f.service.fetch(request(consentPath,'u1','PUT',{symbol:'ABC',enabled:true,expectedWatchlistRevision:0,expectedTargetRevision:1,expectedDestinationRevision:1}));assert.equal(r.status,409);assert.equal(f.wire.length,0);assert.equal((await query(f.db,"SELECT email_enabled FROM watchlist_entries WHERE user_id='u1'"))[0].email_enabled,0);
});
test('consent is scoped to the cookie account and rejects a mismatched precondition',async t=>{
 const f=await fixture(t);await verify(f,'u1','friend-one@example.invalid');const r=await f.service.fetch(request(consentPath,'u1','PUT',{symbol:'ABC',enabled:true,expectedWatchlistRevision:0,expectedTargetRevision:1,expectedDestinationRevision:1},'u2'));assert.equal(r.status,409);assert.equal((await query(f.db,'SELECT sum(email_enabled) AS n FROM watchlist_entries'))[0].n,0);
 const read=await f.service.fetch(request(consentPath,'u2'));assert.equal(read.status,200);assert.equal((await read.json()).destination,null);
});
test('explicit enrolment gate stays off while authenticated opt-out remains available',async t=>{
 const f=await fixture(t,{enrollmentEnabled:false});await verify(f,'u1','friend-one@example.invalid');assert.equal((await consent(f,'u1',true)).status,409);assert.equal((await consent(f,'u1',false)).status,200);
});
test('anonymous consent does not expose private preferences',async t=>{
 const f=await fixture(t);const r=await f.service.fetch(request(consentPath,null));assert.equal(r.status,401);assert.equal(f.wire.length,0);
});
