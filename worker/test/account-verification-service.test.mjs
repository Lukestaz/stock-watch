import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createGmailSmtpTransport} from '../src/account-gmail-smtp.mjs';
import {createD1VerificationControls} from '../src/account-verification-controls.mjs';
globalThis.crypto ??= webcrypto;
const user='sender@example.invalid',password='abcdefghijklmnop';
const message={from:user,to:'friend@example.invalid',subject:'[Stock Watch] Verify your email address',text:'Stock Watch email verification\n\ncafé\n.\ncode'};
function smtpFixture(options={}){
 const writes=[];let controller,closed=false,calls=0;
 const encode=new TextEncoder();
 const respond=text=>{const data=encode.encode(text);controller.enqueue(data.slice(0,2));controller.enqueue(data.slice(2));};
 const readable=new ReadableStream({start(c){controller=c;respond(options.greeting||'220 smtp.test ready\r\n');}});
 const writable=new WritableStream({write(bytes){
  const text=new TextDecoder().decode(bytes);writes.push(text);
  if(text.startsWith('EHLO'))respond(options.ehlo||'250-smtp.test\r\n250 AUTH LOGIN PLAIN\r\n');
  else if(text.startsWith('AUTH')){if(!options.hangAuth)respond(options.auth||'235 authenticated\r\n');}
  else if(text.startsWith('MAIL'))respond('250 sender ok\r\n');
  else if(text.startsWith('RCPT'))respond(options.rcpt||'250 recipient ok\r\n');
  else if(text==='DATA\r\n')respond('354 send body\r\n');
  else if(text.endsWith('\r\n.\r\n')){if(options.dropData){controller.close();closed=true;}else if(!options.hangData)respond(options.data||'250 queued\r\n');}
 }});
 const socket={readable,writable,opened:options.hangOpen?new Promise(()=>{}):Promise.resolve(),closed:Promise.resolve(),close(){if(!closed){closed=true;try{controller.close();}catch{}}return Promise.resolve();}};
 const connect=(address,settings)=>{calls++;assert.deepEqual(address,{hostname:'smtp.gmail.com',port:465});assert.equal(settings.secureTransport,'on');return socket;};
 return {transport:createGmailSmtpTransport({enabled:true,connect,username:user,appPassword:password,timeoutMs:(options.hangOpen||options.hangAuth||options.hangData)?30:1000}),writes,get calls(){return calls;},get closed(){return closed;}};
}
test('TLS SMTP submits one UTF-8 MIME message and accepts only final acknowledgement',async()=>{
 const f=smtpFixture();assert.deepEqual(await f.transport.send(message),{outcome:'accepted',category:null});assert.equal(f.calls,1);assert.equal(f.closed,true);
 assert.equal(f.writes.filter(s=>s.startsWith('RCPT')).length,1);
 const auth=f.writes.find(s=>s.startsWith('AUTH PLAIN ')).slice(11).trim();assert.equal(Buffer.from(auth,'base64').toString('utf8'),String.fromCharCode(0)+user+String.fromCharCode(0)+password);
 const data=f.writes.at(-1);assert.ok(data.includes('Content-Transfer-Encoding: base64'));assert.ok(!data.includes('café'));
 const body=data.split('\r\n\r\n')[1].split('\r\n.\r\n')[0].replaceAll('\r\n','');assert.equal(Buffer.from(body,'base64').toString('utf8'),message.text);
});
test('disabled or invalid credentials never open a socket',async()=>{
 let count=0;for(const options of [{},{enabled:true,username:user,appPassword:'bad'},{enabled:true,username:'bad\r\naddress',appPassword:password}]){
  const t=createGmailSmtpTransport({connect:()=>count++,...options});assert.equal((await t.send(message)).outcome,'not_sent');
 }assert.equal(count,0);
});
test('header injection, another sender and arbitrary subject fail before connecting',async()=>{
 const f=smtpFixture();for(const change of [{to:'a@example.invalid\r\nBcc:b@example.invalid'},{from:'other@example.invalid'},{subject:'custom'},{text:'a'.repeat(9000)}])assert.equal((await f.transport.send({...message,...change})).outcome,'not_sent');assert.equal(f.calls,0);
});
test('missing AUTH PLAIN capability never releases credentials',async()=>{
 const f=smtpFixture({ehlo:'250 SMTP ready\r\n'});assert.equal((await f.transport.send(message)).outcome,'not_sent');assert.equal(f.writes.filter(s=>s.startsWith('AUTH')).length,0);
});
test('authentication failure is sanitized and does not submit DATA',async()=>{
 const f=smtpFixture({auth:'535 private provider detail\r\n'}),result=await f.transport.send(message);assert.equal(result.outcome,'not_sent');assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!f.writes.includes('DATA\r\n'));
});
test('recipient rejection never submits the body',async()=>{
 const f=smtpFixture({rcpt:'550 rejected\r\n'});assert.equal((await f.transport.send(message)).outcome,'not_sent');assert.ok(!f.writes.includes('DATA\r\n'));
});
test('explicit rejection after DATA is failed, not accepted',async()=>{
 const f=smtpFixture({data:'550 rejected\r\n'});assert.equal((await f.transport.send(message)).outcome,'failed');assert.equal(f.calls,1);
});
test('connection loss after DATA is unknown and never retried',async()=>{
 const f=smtpFixture({dropData:true});assert.equal((await f.transport.send(message)).outcome,'outcome_unknown');assert.equal(f.calls,1);
});
test('timeout before DATA closes the socket without submission',async()=>{
 const f=smtpFixture({hangAuth:true}),r=await f.transport.send(message);assert.equal(r.outcome,'not_sent');assert.equal(r.category,'smtp_timeout');assert.equal(f.closed,true);assert.ok(!f.writes.includes('DATA\r\n'));
});
test('timeout after DATA is unknown and keeps a single connection attempt',async()=>{
 const f=smtpFixture({hangData:true}),r=await f.transport.send(message);assert.equal(r.outcome,'outcome_unknown');assert.equal(r.category,'smtp_timeout');assert.equal(f.calls,1);
});
test('malformed or oversized replies fail closed',async()=>{
 for(const greeting of ['garbage\r\n','220 '+ 'x'.repeat(3000)+'\r\n']){const f=smtpFixture({greeting});assert.equal((await f.transport.send(message)).outcome,'not_sent');assert.equal(f.closed,true);}
});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
function controlFixture(t,limits={}){
 const dir=mkdtempSync(join(tmpdir(),'verification-controls-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 let now=1000000;return {db,controls:createD1VerificationControls({db,limits,clock:()=>now,admissionKey:request=>request.headers.get('X-Test-Trusted-Edge')}),setTime:value=>now=value};
}
const request=actor=>new Request('https://app.example.invalid',{headers:actor?{'X-Test-Trusted-Edge':actor}:{}});
test('durable admission applies actor and global caps without retaining raw keys',async t=>{
 const {db,controls}=controlFixture(t,{admissionPerMinute:1,globalPerScopeMinute:2});assert.equal(await controls.admit(request('edge-a')),true);assert.equal(await controls.admit(request('edge-a')),false);assert.equal(await controls.admit(request('edge-b')),true);assert.equal(await controls.admit(request('edge-c')),false);assert.equal(await controls.admit(request(null)),false);
 assert.ok(!JSON.stringify(await query(db,'SELECT * FROM verification_request_attempts')).includes('edge-a'));
});
test('account registration and verification limits are isolated by scope and account',async t=>{
 const {controls}=controlFixture(t,{registrationPerMinute:1,verificationPerMinute:1});const r=request('edge');
 assert.equal(await controls.limit(r,'u1','/v1/alert-destination/email'),true);assert.equal(await controls.limit(r,'u1','/v1/alert-destination/email'),false);assert.equal(await controls.limit(r,'u1','/v1/alert-destination/email/verify'),true);assert.equal(await controls.limit(r,'u2','/v1/alert-destination/email'),true);
});
test('concurrent admission has only one final-slot winner',async t=>{
 const {controls}=controlFixture(t,{admissionPerMinute:1});const values=await Promise.all([controls.admit(request('same')),controls.admit(request('same'))]);assert.equal(values.filter(Boolean).length,1);
});
test('fixed minute reset and backward-clock denial work',async t=>{
 const {controls,setTime}=controlFixture(t,{admissionPerMinute:1});assert.equal(await controls.admit(request('edge')),true);setTime(999999);assert.equal(await controls.admit(request('other')),false);setTime(1000080);assert.equal(await controls.admit(request('edge')),true);
});
test('retention deletes only older-than-48-hour reservations and challenges',async t=>{
 const {db,controls}=controlFixture(t);
 await query(db,"INSERT INTO verification_mail_reservations(id,user_id,destination_hash,created_at) VALUES ('old','u1',?,800000),('new','u1',?,999999)",['a'.repeat(64),'b'.repeat(64)]);
 await query(db,"INSERT INTO verification_request_attempts(id,scope,actor_hash,created_at) VALUES ('old','admission',?,800000),('new','admission',?,999999)",['a'.repeat(64),'b'.repeat(64)]);
 await query(db,"INSERT INTO alert_destinations(user_id,channel,address,provider) VALUES ('u1','email','old@example.invalid','shared-smtp'),('u2','email','new@example.invalid','shared-smtp')");
 await query(db,"INSERT INTO alert_email_challenges(user_id,challenge_hash,destination_revision,address,provider,created_at,expires_at) VALUES ('u1',?,1,'old@example.invalid','shared-smtp',799500,800000),('u2',?,1,'new@example.invalid','shared-smtp',999500,1000100)",['a'.repeat(64),'b'.repeat(64)]);
 assert.equal(await controls.cleanup(),true);
 assert.deepEqual(await query(db,'SELECT user_id FROM alert_email_challenges'),[{user_id:'u2'}]);
 assert.deepEqual(await query(db,'SELECT id FROM verification_mail_reservations'),[{id:'new'}]);assert.deepEqual(await query(db,'SELECT id FROM verification_request_attempts'),[{id:'new'}]);
});
test('opening timeout never starts SMTP authentication',async()=>{
 const f=smtpFixture({hangOpen:true}),r=await f.transport.send(message);assert.equal(r.outcome,'not_sent');assert.equal(r.category,'smtp_timeout');assert.equal(f.writes.length,0);assert.equal(f.closed,true);
});
