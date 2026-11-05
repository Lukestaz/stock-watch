import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAlertDestinationRoutes} from '../src/account-alert-destinations.mjs';
globalThis.crypto ??= webcrypto;
const origin='https://app.example.invalid',root='/v1/alert-destination/email';
const request=(body,path=root,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...headers},body:JSON.stringify(body)});
function fixture(options={}){
 let now=1000;const challenges=new Map(),destinations=new Map(),mail=[],calls=[];
 const store={
  async beginEmailVerification(value){
   calls.push(value);const old=destinations.get(value.userId);
   const revision=(old?.revision||0)+1;
   destinations.set(value.userId,{address:value.address,revision,verified:false,enabled:false});
   challenges.set(value.userId,{...value,revision,used:false});return true;
  },
  async completeEmailVerification({userId,challengeHash,now}){
   const c=challenges.get(userId),d=destinations.get(userId);
   if(!c||!d||c.used||c.challengeHash!==challengeHash||now<c.now||now>=c.expiresAt||c.revision!==d.revision)return false;
   c.used=true;d.verified=true;d.enabled=false;return true;
  }
 };
 const config={enabled:true,allowedOrigin:origin,authenticate:async()=>({userId:'alice'}),limit:async()=>true,store,sendVerification:async value=>{mail.push(value);return true;},clock:()=>now,...options};
 return {route:createAlertDestinationRoutes(config),routeFor:user=>createAlertDestinationRoutes({...config,authenticate:async()=>({userId:user})}),mail,calls,destinations,challenges,setTime:value=>now=value};
}

test('disabled by default and construction has no side effects',async()=>{
 let called=0;const route=createAlertDestinationRoutes({allowedOrigin:origin,authenticate:()=>called++});
 assert.equal(called,0);assert.equal((await route(request({address:'a@example.invalid'}))).status,503);assert.equal(called,0);
});
test('register hashes a random token and does not return it or enrol alerts',async()=>{
 const f=fixture(),r=await f.route(request({address:'Alice@EXAMPLE.INVALID'}));
 assert.equal(r.status,202);assert.deepEqual(await r.json(),{ok:true});assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(f.mail[0].to,'Alice@example.invalid');assert.match(f.mail[0].token,/^[a-f0-9]{64}$/);
 assert.match(f.calls[0].challengeHash,/^[a-f0-9]{64}$/);assert.notEqual(f.calls[0].challengeHash,f.mail[0].token);
 assert.equal(f.calls[0].expiresAt-f.calls[0].now,600);assert.equal(f.destinations.get('alice').enabled,false);
});
test('verification is account-bound, single use and does not opt in',async()=>{
 const f=fixture();await f.route(request({address:'alice@example.invalid'}));const token=f.mail[0].token;
 assert.equal((await f.routeFor('bob')(request({token},root+'/verify'))).status,400);
 const result=await f.route(request({token},root+'/verify'));assert.equal(result.status,200);assert.deepEqual(await result.json(),{verified:true,alertsEnabled:false});
 assert.equal((await f.route(request({token},root+'/verify'))).status,400);assert.equal(f.destinations.get('alice').enabled,false);
});
test('two accounts retain separate destinations and challenges',async()=>{
 const f=fixture();await f.route(request({address:'alice@example.invalid'}));await f.routeFor('bob')(request({address:'bob@example.invalid'}));
 assert.equal(f.destinations.get('alice').address,'alice@example.invalid');assert.equal(f.destinations.get('bob').address,'bob@example.invalid');
 assert.notEqual(f.mail[0].token,f.mail[1].token);assert.equal((await f.routeFor('bob')(request({token:f.mail[0].token},root+'/verify'))).status,400);
});
test('expiry boundary and a replaced destination invalidate earlier tokens',async()=>{
 const f=fixture();await f.route(request({address:'alice@example.invalid'}));const token=f.mail[0].token;
 f.setTime(1600);assert.equal((await f.route(request({token},root+'/verify'))).status,400);
 f.setTime(1001);await f.route(request({address:'new@example.invalid'}));
 assert.equal((await f.route(request({token},root+'/verify'))).status,400);assert.equal((await f.route(request({token:f.mail[1].token},root+'/verify'))).status,200);
});
test('anonymous, cross-origin and rate-limited requests cannot store or send',async()=>{
 for(const options of [{authenticate:async()=>null},{limit:async()=>false},{authenticate:async()=>{throw Error('private');}}]){
  const f=fixture(options);const r=await f.route(request({address:'a@example.invalid'}));assert.ok([401,429,503].includes(r.status));assert.equal(f.mail.length,0);assert.equal(f.calls.length,0);
 }
 const f=fixture();assert.equal((await f.route(request({address:'a@example.invalid'},root,{Origin:'https://evil.invalid'}))).status,403);assert.equal(f.calls.length,0);
});
test('identity and provider fields cannot be supplied in the request',async()=>{
 const f=fixture();for(const body of [{address:'a@example.invalid',userId:'bob'},{address:'a@example.invalid',verified:true},{address:'a@example.invalid',provider:'attacker'},{address:'a@example.invalid',enabled:true}])assert.equal((await f.route(request(body))).status,400);
 assert.equal(f.calls.length,0);assert.equal(f.mail.length,0);
});
test('bounded bodies and conservative addresses fail before storage',async()=>{
 const f=fixture();for(const address of ['a\r\nBcc:b@example.invalid','a@localhost','a..b@example.invalid','a@example.invalid,b@example.invalid','x'.repeat(2200),' a@example.invalid'])assert.equal((await f.route(request({address}))).status,400);
 assert.equal(f.calls.length,0);assert.equal(f.mail.length,0);
});
test('mail failures stay generic and cannot verify or enable the destination',async()=>{
 const f=fixture({sendVerification:async()=>{throw Error('secret SMTP detail');}}),r=await f.route(request({address:'alice@example.invalid'}));
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Destination service unavailable'});assert.equal(f.destinations.get('alice').verified,false);assert.equal(f.destinations.get('alice').enabled,false);
});
test('parallel token consumption has one winner in the store contract',async()=>{
 const f=fixture();await f.route(request({address:'alice@example.invalid'}));const token=f.mail[0].token;
 const results=await Promise.all([f.route(request({token},root+'/verify')),f.route(request({token},root+'/verify'))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});
