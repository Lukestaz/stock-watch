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
globalThis.crypto ??= webcrypto;
const origin='https://app.example.invalid',root='/v1/alert-destination/email',sender='sender@example.invalid';
const tokens={u1:'a'.repeat(43),u2:'b'.repeat(43)};
const req=(body,user='u1',path=root,expected=user)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(user?{Cookie:SESSION_COOKIE+'='+tokens[user]}:{}),...(expected?{'X-Watchlist-Account':expected}:{})},body:JSON.stringify(body)});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
async function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'gmail-assembled-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 for(const user of ['u1','u2'])await query(db,'INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,1000000,1000000,2000000)',[await tokenHash(tokens[user]),user]);
 let now=1000000,connections=0;const messages=[];
 const connect=(address,settings)=>{
  connections++;assert.equal(address.hostname,'smtp.gmail.com');assert.equal(address.port,465);assert.equal(settings.secureTransport,'on');let c,closed=false;
  const respond=text=>{if(!closed)c.enqueue(new TextEncoder().encode(text));};
  const readable=new ReadableStream({start(controller){c=controller;respond('220 ready\r\n');}});
  const writable=new WritableStream({write(bytes){
   const text=new TextDecoder().decode(bytes);
   if(text.startsWith('EHLO'))respond('250-test\r\n250 AUTH PLAIN\r\n');
   else if(text.startsWith('AUTH'))respond('235 ok\r\n');
   else if(text.startsWith('MAIL')||text.startsWith('RCPT'))respond('250 ok\r\n');
   else if(text==='DATA\r\n')respond('354 continue\r\n');
   else if(text.endsWith('\r\n.\r\n')){
    const raw=text.split('\r\n\r\n')[1].split('\r\n.\r\n')[0].replaceAll('\r\n','');messages.push(Buffer.from(raw,'base64').toString('utf8'));
    if(!options.hangData)respond(options.rejectData?'550 rejected\r\n':'250 accepted\r\n');
   }
  }});
  return {readable,writable,opened:Promise.resolve(),closed:Promise.resolve(),close(){if(!closed){closed=true;try{c.close();}catch{}}return Promise.resolve();}};
 };
 const config={enabled:true,db,connect,username:sender,appPassword:'abcdefghijklmnop',timeoutMs:options.hangData?30:1000,allowedOrigin:origin,clientId:'test-client',loadGoogleKeys:async()=>{throw Error('Unexpected Google request');},admissionKey:()=> 'trusted-test-edge',clock:()=>now,...(options.requestLimits?{requestLimits:options.requestLimits}:{})};
 return {db,service:createGmailVerificationService(config),messages,get connections(){return connections;},setTime:value=>now=value,config};
}
const code=f=>f.messages.at(-1).match(/\b[a-f0-9]{64}\b/)[0];
test('disabled assembled service cannot access storage or sockets',async()=>{
 let calls=0;const service=createGmailVerificationService({db:{prepare:()=>calls++,batch:()=>calls++},connect:()=>calls++});assert.equal((await service.fetch(req({address:'a@example.invalid'}))).status,503);assert.equal(await service.cleanup(),false);assert.equal(calls,0);
});
test('real assembled service authenticates, reserves, speaks SMTP and verifies without enabling alerts',async t=>{
 const f=await fixture(t);assert.equal((await f.service.fetch(req({address:'friend@example.invalid'}))).status,202);assert.equal(f.connections,1);assert.equal(f.messages.length,1);
 assert.equal((await query(f.db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);
 const r=await f.service.fetch(req({token:code(f)},'u1',root+'/verify'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{verified:true,alertsEnabled:false});assert.deepEqual(await query(f.db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:1000000,enabled:0}]);
});
test('account precondition mismatch does not send or reserve mail capacity',async t=>{
 const f=await fixture(t);assert.equal((await f.service.fetch(req({address:'a@example.invalid'},'u2',root,'u1'))).status,409);assert.equal(f.connections,0);assert.deepEqual(await query(f.db,'SELECT id FROM verification_mail_reservations'),[]);
});
test('one users code cannot verify another users destination',async t=>{
 const f=await fixture(t);await f.service.fetch(req({address:'one@example.invalid'}));const first=code(f);await f.service.fetch(req({address:'two@example.invalid'},'u2'));
 assert.equal((await f.service.fetch(req({token:first},'u2',root+'/verify'))).status,400);assert.equal((await f.service.fetch(req({token:first},'u1',root+'/verify'))).status,200);
});
test('real request limit rejects resend without replacing the existing challenge',async t=>{
 const f=await fixture(t,{requestLimits:{registrationPerMinute:1}});await f.service.fetch(req({address:'one@example.invalid'}));const token=code(f);
 assert.equal((await f.service.fetch(req({address:'new@example.invalid'}))).status,429);assert.equal(f.connections,1);assert.equal((await f.service.fetch(req({token},'u1',root+'/verify'))).status,200);
});
test('post-DATA rejection and timeout keep reservation charged and do not retry',async t=>{
 for(const options of [{rejectData:true},{hangData:true}]){
  const f=await fixture(t,options);const r=await f.service.fetch(req({address:'one@example.invalid'}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Destination service unavailable'});
  assert.equal((await f.service.fetch(req({address:'one@example.invalid'}))).status,503);assert.equal(f.connections,1);assert.equal((await query(f.db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);
 }
});
test('failed verification storage never opens an SMTP socket',async t=>{
 const f=await fixture(t);await query(f.db,"CREATE TRIGGER fail_begin BEFORE INSERT ON alert_email_challenges BEGIN SELECT RAISE(ABORT,'synthetic'); END");assert.equal((await f.service.fetch(req({address:'one@example.invalid'}))).status,503);assert.equal(f.connections,0);assert.equal((await query(f.db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);
});
test('service retention preserves current challenges and removes aged state',async t=>{
 const f=await fixture(t);await f.service.fetch(req({address:'old@example.invalid'}));f.setTime(1200000);await f.service.fetch(req({address:'current@example.invalid'},'u2'));
 assert.equal(await f.service.cleanup(),true);assert.deepEqual(await query(f.db,'SELECT user_id FROM alert_email_challenges'),[{user_id:'u2'}]);assert.deepEqual(await query(f.db,'SELECT user_id FROM verification_mail_reservations'),[{user_id:'u2'}]);
});
