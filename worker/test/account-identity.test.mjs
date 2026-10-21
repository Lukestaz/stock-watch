import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createIdentityService,verifyGoogleIdToken,tokenHash,SESSION_COOKIE,SESSION_TTL,IDLE_TTL} from '../src/account-identity.mjs';
globalThis.crypto ??= webcrypto;
const now=1700000000,clientId='test-client',nonce='a'.repeat(64);
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const b64=value=>Buffer.from(value).toString('base64url');
async function sign(changes={},header={}){
 const h=b64(JSON.stringify({alg:'RS256',kid:'test-key',...header}));
 const p=b64(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub:'google-user',nonce,iat:now,exp:now+3600,...changes}));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+b64(signature);
}
const verify=jwt=>verifyGoogleIdToken(jwt,{clientId,nonce,keys:[jwk],now});
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'identity-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);let time=now;
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);
  child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 return {db,advance:seconds=>time+=seconds,service:createIdentityService({db,clientId,loadGoogleKeys:async()=>[jwk],clock:()=>time})};
}
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
const request=result=>new Request('https://app.example/v1/watchlist',{headers:{Cookie:result.setCookie.split(';')[0]}});
async function login(service,sub='google-user'){
 const challenge=await service.beginLogin();return service.completeLogin({challenge:challenge.challenge,idToken:await sign({nonce:challenge.nonce,sub})});
}
test('valid signed identity uses stable subject only',async()=>{assert.deepEqual(await verify(await sign({email:'not-an-identifier@example.test'})),{googleSub:'google-user'});});
test('claims and algorithm attacks rejected',async()=>{for(const changes of [{iss:'evil'},{aud:'other'},{azp:'other'},{exp:now},{iat:now+61},{nbf:now+1},{nonce:'wrong'},{sub:''},{exp:'later'},{exp:now+10000}])await assert.rejects(verify(await sign(changes)));for(const header of [{alg:'none'},{alg:'HS256'},{kid:'unknown'},{crit:[]},{jku:'https://evil.example'}])await assert.rejects(verify(await sign({},header)));});
test('signature tampering and malformed tokens rejected',async()=>{const parts=(await sign()).split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);await assert.rejects(verify(parts.join('.')));for(const value of ['', 'a.b.c','x'.repeat(16385)])await assert.rejects(verify(value));});
test('login provisions empty account and stores only session hash',async t=>{const {service,db}=fixture(t);const result=await login(service);assert.deepEqual(await service.authenticate(request(result)),{userId:result.userId});assert.match(result.setCookie,/Path=\/; Secure; HttpOnly; SameSite=Lax/);const rows=await query(db,'SELECT token_hash,user_id FROM sessions');const raw=result.setCookie.split(';')[0].split('=')[1];assert.equal(rows[0].token_hash,await tokenHash(raw));assert.notEqual(rows[0].token_hash,raw);assert.equal((await query(db,'SELECT revision FROM watchlists WHERE user_id=?',[result.userId]))[0].revision,0);assert.deepEqual(await query(db,'SELECT * FROM watchlist_entries WHERE user_id=?',[result.userId]),[]);});
test('returning subject reuses account; different subject isolated',async t=>{const {service}=fixture(t);const a=await login(service),b=await login(service),c=await login(service,'another-user');assert.equal(a.userId,b.userId);assert.notEqual(a.setCookie,b.setCookie);assert.notEqual(a.userId,c.userId);});
test('challenge replay and simultaneous exchange yield one session',async t=>{const {service,db}=fixture(t);const c=await service.beginLogin(),idToken=await sign({nonce:c.nonce});const results=await Promise.allSettled([service.completeLogin({challenge:c.challenge,idToken}),service.completeLogin({challenge:c.challenge,idToken})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await query(db,'SELECT count(*) AS n FROM sessions'))[0].n,1);await assert.rejects(service.completeLogin({challenge:c.challenge,idToken}));});
test('expired or mismatched challenge cannot provision',async t=>{const {service,db,advance}=fixture(t);const c=await service.beginLogin();await assert.rejects(service.completeLogin({challenge:c.challenge,idToken:await sign()}));advance(601);await assert.rejects(service.completeLogin({challenge:c.challenge,idToken:await sign({nonce:c.nonce})}));assert.equal((await query(db,'SELECT count(*) AS n FROM sessions'))[0].n,0);});
test('idle and absolute expiry invalidate sessions',async t=>{const {service,advance}=fixture(t);const result=await login(service);advance(IDLE_TTL);assert.equal(await service.authenticate(request(result)),null);const other=fixture(t);const fresh=await login(other.service);for(let i=0;i<4;i++){other.advance(6*86400);assert.ok(await other.service.authenticate(request(fresh)));}other.advance(SESSION_TTL-24*86400);assert.equal(await other.service.authenticate(request(fresh)),null);});
test('logout revokes server-side and duplicate or HTTP cookies rejected',async t=>{const {service}=fixture(t);const result=await login(service),r=request(result);assert.equal(await service.authenticate(new Request('http://app.example',{headers:r.headers})),null);const duplicate=new Request(r.url,{headers:{Cookie:r.headers.get('Cookie')+'; '+r.headers.get('Cookie')}});assert.equal(await service.authenticate(duplicate),null);const cleared=await service.logout(r);assert.match(cleared.setCookie,/Max-Age=0/);assert.equal(await service.authenticate(r),null);assert.equal(await service.authenticate(new Request(r.url)),null);});
test('failed provisioning rolls back challenge consumption and new user',async t=>{const {service,db}=fixture(t);const c=await service.beginLogin(),idToken=await sign({nonce:c.nonce});await query(db,"CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'test failure'); END;");await assert.rejects(service.completeLogin({challenge:c.challenge,idToken}));assert.equal((await query(db,'SELECT count(*) AS n FROM users WHERE google_sub=?',['google-user']))[0].n,0);assert.equal((await query(db,'SELECT used_by FROM login_challenges WHERE challenge_hash=?',[c.nonce]))[0].used_by,null);await query(db,'DROP TRIGGER fail_session');assert.ok(await service.completeLogin({challenge:c.challenge,idToken}));});
