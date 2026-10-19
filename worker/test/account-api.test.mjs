import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatchlistApi,validateUpdate} from '../src/account-api.mjs';
const origin='https://dashboard.example';
const stock={symbol:'LUNR',target:12.5,alertsEnabled:false};
const update={expectedRevision:0,stocks:[stock]};
const req=(method='GET',body,extra={})=>new Request('https://api.example/v1/watchlist',{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
function fixture(auth=async()=>({userId:'verified-user'})){
 const calls=[];let revision=0;
 const store={read:async id=>{calls.push(['read',id]);return {revision,stocks:[]};},replace:async(id,expected,stocks)=>{calls.push(['replace',id,expected]);if(expected!==revision)return null;revision++;return {revision,stocks};}};
 return {calls,api:createWatchlistApi({allowedOrigin:origin,authenticate:auth,store})};
}
test('unconfigured handler fails closed',async()=>assert.equal((await createWatchlistApi()(req())).status,503));
test('missing or forged principal cannot access storage',async()=>{for(const principal of [null,{}, {userId:123}]){const {api,calls}=fixture(async()=>principal);assert.equal((await api(req())).status,401);assert.deepEqual(calls,[]);}});
test('reads use verified identity and never cache',async()=>{const {api,calls}=fixture();const r=await api(req('GET',undefined,{'X-User-Id':'victim'}));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(calls,[['read','verified-user']]);});
test('client identity fields and query injection rejected',async()=>{const {api,calls}=fixture();assert.equal((await api(req('PUT',{...update,userId:'victim'}))).status,400);assert.equal((await api(new Request('https://api.example/v1/watchlist?userId=victim',{headers:{Origin:origin}}))).status,400);assert.deepEqual(calls,[]);});
test('foreign or absent origins denied',async()=>{const {api,calls}=fixture();assert.equal((await api(req('GET',undefined,{Origin:'https://evil.example'}))).status,403);assert.equal((await api(new Request('https://api.example/v1/watchlist'))).status,403);assert.deepEqual(calls,[]);});
test('valid save and stale revision conflict',async()=>{const {api,calls}=fixture();const first=await api(req('PUT',update));assert.equal(first.status,200);assert.equal((await first.json()).revision,1);assert.equal((await api(req('PUT',update))).status,409);assert.deepEqual(calls,[['replace','verified-user',0],['replace','verified-user',0]]);});
test('strict validation rejects malformed fields',()=>{for(const value of [{...update,expectedRevision:0.5},{...update,expectedRevision:-1},{...update,expectedRevision:'0'},{...update,stocks:Array(101).fill(stock)},{...update,stocks:[stock,stock]},...['A B','A!','lunr','-ABC'].map(symbol=>({...update,stocks:[{...stock,symbol}]})),...[0,-1,Infinity,NaN,'12'].map(target=>({...update,stocks:[{...stock,target}]})),{...update,stocks:[{...stock,alertsEnabled:1}]},{...update,stocks:[{...stock,extra:true}]}])assert.throws(()=>validateUpdate(value));assert.deepEqual(validateUpdate(update),update);});
test('alert enrollment blocked without saving',async()=>{const {api,calls}=fixture();assert.equal((await api(req('PUT',{...update,stocks:[{...stock,alertsEnabled:true}]}))).status,409);assert.deepEqual(calls,[]);});
test('oversized and invalid JSON blocked',async()=>{const {api,calls}=fixture();for(const body of ['{', ' '.repeat(32769)]){assert.equal((await api(new Request('https://api.example/v1/watchlist',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body}))).status,400);}assert.deepEqual(calls,[]);});
test('storage and auth failures do not leak exceptions',async()=>{const {api}=fixture(async()=>{throw Error('secret');});const r=await api(req());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret'));const failing=createWatchlistApi({allowedOrigin:origin,authenticate:async()=>({userId:'u'}),store:{read:async()=>{throw Error('secret');},replace:async()=>{throw Error('secret');}}});assert.equal((await failing(req())).status,503);});
test('unsupported method and media type do not write',async()=>{const {api,calls}=fixture();assert.equal((await api(req('POST',update))).status,405);assert.equal((await api(req('PUT',update,{'Content-Type':'text/plain'}))).status,415);assert.deepEqual(calls,[]);});
