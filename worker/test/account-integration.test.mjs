import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createIdentityService,tokenHash,SESSION_COOKIE,SESSION_TTL,IDLE_TTL} from '../src/account-identity.mjs';
import {createSessionWatchlistApi} from '../src/account-integration.mjs';
globalThis.crypto ??= webcrypto;
const origin='https://app.example',now=1700000000;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'account-integration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);let time=now;
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);
  child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 const config={db,clientId:'test-client',loadGoogleKeys:async()=>{throw Error('Google login is not used by these session integration tests');},clock:()=>time};
 const session=async(userId='u1')=>{const raw=randomBytes(32).toString('base64url');await query(db,'INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?)',[await tokenHash(raw),userId,time,time,time+SESSION_TTL]);return {userId,cookie:SESSION_COOKIE+'='+raw};};
 return {db,session,advance:seconds=>time+=seconds,service:createIdentityService(config),api:createSessionWatchlistApi({...config,enabled:true,allowedOrigin:origin})};
}
const item=(target=10)=>({symbol:'LUNR',target,alertsEnabled:false});
const request=(session,method='GET',body,extra={})=>new Request(origin+'/v1/watchlist',{method,headers:{Origin:origin,...(session?{Cookie:session.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
const send=(api,...args)=>api(request(...args));
test('authenticated sessions read and save only their own watchlists',async t=>{
 const {api,session}=fixture(t);const a=await session('u1'),b=await session('u2');
 assert.equal((await send(api,a,'PUT',{expectedRevision:0,stocks:[item(10)]})).status,200);
 assert.equal((await send(api,b,'PUT',{expectedRevision:0,stocks:[item(20)]})).status,200);
 const r=await send(api,a,'GET',undefined,{'X-User-Id':b.userId});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.deepEqual((await r.json()).stocks,[item(10)]);assert.deepEqual((await (await send(api,b)).json()).stocks,[item(20)]);
});
test('identity injection cannot select another account',async t=>{
 const {api,session}=fixture(t);const a=await session('u1'),b=await session('u2');
 assert.equal((await send(api,a,'PUT',{expectedRevision:0,stocks:[item()],userId:b.userId})).status,400);
 assert.equal((await send(api,a,'PUT',{expectedRevision:0,stocks:[{...item(),symbol:'A\\B'}]})).status,400);
 const q=new Request(origin+'/v1/watchlist?userId='+b.userId,{headers:{Origin:origin,Cookie:a.cookie}});assert.equal((await api(q)).status,400);
 assert.equal((await send(api,a,'PUT',{expectedRevision:0,stocks:[item()]},{'X-User-Id':b.userId})).status,200);
 assert.deepEqual((await (await send(api,b)).json()).stocks,[]);
});
test('anonymous forged expired and logged-out cookies cannot save',async t=>{
 const {api,session,service,advance,db}=fixture(t);const a=await session();
 assert.equal((await send(api,null)).status,401);
 assert.equal((await send(api,null,'GET',undefined,{Cookie:SESSION_COOKIE+'='+'A'.repeat(43)})).status,401);
 advance(IDLE_TTL);assert.equal((await send(api,a,'PUT',{expectedRevision:0,stocks:[item()]})).status,401);
 const fresh=fixture(t);const b=await fresh.session();await fresh.service.logout(request(b));assert.equal((await send(fresh.api,b)).status,401);
 assert.equal((await query(db,'SELECT revision FROM watchlists WHERE user_id=?',[a.userId]))[0].revision,0);
});
test('two sessions racing same revision cannot overwrite each other',async t=>{
 const {api,session}=fixture(t);const a=await session(),b=await session();
 const responses=await Promise.all([send(api,a,'PUT',{expectedRevision:0,stocks:[item(11)]}),send(api,b,'PUT',{expectedRevision:0,stocks:[item(22)]})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const winner=await responses.find(r=>r.status===200).json();assert.deepEqual(await (await send(api,a)).json(),winner);
});
test('same-origin GET metadata allowed; unsafe origins and writes denied',async t=>{
 const {api,session}=fixture(t);const a=await session();const get=headers=>new Request(origin+'/v1/watchlist',{headers:{Cookie:a.cookie,...headers}});
 assert.equal((await api(get({'Sec-Fetch-Site':'same-origin'}))).status,200);
 assert.equal((await api(get({}))).status,403);
 assert.equal((await api(get({'Sec-Fetch-Site':'cross-site',Origin:origin}))).status,403);
 assert.equal((await send(api,a,'GET',undefined,{Origin:'https://evil.example'})).status,403);
 for(const url of ['http://app.example/v1/watchlist','https://other.example/v1/watchlist'])assert.equal((await api(new Request(url,{headers:{Cookie:a.cookie,Origin:origin}}))).status,403);
 const put=new Request(origin+'/v1/watchlist',{method:'PUT',headers:{Cookie:a.cookie,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({expectedRevision:0,stocks:[item()]})});assert.equal((await api(put)).status,403);
});
test('default-off configuration and database failures fail closed',async t=>{
 assert.equal((await createSessionWatchlistApi()(new Request(origin+'/v1/watchlist'))).status,503);
 assert.equal((await createSessionWatchlistApi({enabled:true,allowedOrigin:'http://app.example'})(new Request('http://app.example/v1/watchlist'))).status,503);
 const {api,session,db}=fixture(t);const a=await session();await query(db,'DROP TABLE sessions');const r=await send(api,a,'PUT',{expectedRevision:0,stocks:[item()]});assert.equal(r.status,503);assert.ok(!(await r.text()).includes('no such table'));assert.equal((await query(db,'SELECT revision FROM watchlists WHERE user_id=?',[a.userId]))[0].revision,0);
});
