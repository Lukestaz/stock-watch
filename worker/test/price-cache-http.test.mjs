import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPriceWorker} from '../src/index.mjs';
const url='https://stock-watch-prices.lukestaz.workers.dev/v1/stock?symbol=AAPL';
const env={ALLOWED_ORIGIN:'https://lukestaz.github.io',ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',DB:{},
 CLIENT_LIMIT:{limit:async()=>({success:true})},UPSTREAM_LIMIT:{limit:async()=>({success:true})}};
function snapshot(state='fresh'){
 const now=Date.now(),checked=now-(state==='stale'?7200000:0);
 const part={state,checkedAt:new Date(checked).toISOString(),freshUntil:new Date(checked+300000).toISOString()};
 return {symbol:'AAPL',price:10,time:new Date(checked-1200000).toISOString(),history:[],
  fetchedAt:part.checkedAt,dataCutoff:new Date(checked-960000).toISOString(),cache:{history:part,latest:part}};
}
test('fresh edge reuse, uncached stale responses and scheduled cleanup',async()=>{
 const entries=new Map(),pending=[];let gets=0,cleanups=0;
 const service=async()=>({get:async()=>{gets++;return snapshot();},cleanup:async()=>{cleanups++;}});
 const worker=createPriceWorker({service,edge:()=>({match:async k=>entries.get(k.url)?.clone(),put:async(k,v)=>{entries.set(k.url,v);}})});
 const first=await worker.fetch(new Request(url),env,{waitUntil:p=>pending.push(p)});
 assert.equal(first.status,200);assert.match(first.headers.get('Cache-Control'),/^public, max-age=/);
 await Promise.all(pending);await worker.fetch(new Request(url),env,{});assert.equal(gets,1);
 const stale=createPriceWorker({service:async()=>({get:async()=>snapshot('stale')}),edge:()=>undefined});
 const r=await stale.fetch(new Request(url),env,{});assert.equal(r.status,200);
 assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).cache.latest.state,'stale');
 await worker.scheduled({},env);assert.equal(cleanups,1);
});
test('origin and rate guards remain; cache errors never fall back to provider fetch',async t=>{
 let fetches=0,services=0;const oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch;});
 globalThis.fetch=async()=>{fetches++;throw Error('unexpected network');};
 let error=Error('private database detail');
 const worker=createPriceWorker({service:async()=>{services++;return {get:async()=>{throw error;}};},edge:()=>undefined});
 assert.equal((await worker.fetch(new Request(url,{headers:{Origin:'https://evil.example'}}),env,{})).status,403);
 assert.equal((await worker.fetch(new Request(url),{...env,CLIENT_LIMIT:{limit:async()=>({success:false})}},{})).status,429);
 assert.equal(services,0);
 const failed=await worker.fetch(new Request(url),env,{});assert.equal(failed.status,503);
 assert.doesNotMatch(await failed.text(),/private database detail/);
 error=Object.assign(Error('budget'),{code:'budget',retryAt:Math.floor(Date.now()/1000)+60});
 const limited=await worker.fetch(new Request(url),env,{});assert.equal(limited.status,429);
 assert.ok(Number(limited.headers.get('Retry-After'))>0);assert.equal(fetches,0);
 assert.equal((await worker.fetch(new Request(url),{...env,DB:undefined},{})).status,503);
});
test('dashboard accepts separate history timestamps and exposes stale price warnings',async t=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;});
 const element={setAttribute(){},removeAttribute(){},addEventListener(){},after(){},textContent:''};
 globalThis.document={createElement:()=>({...element}),querySelector:()=>element,head:{append(){}}};
 const data=snapshot('stale'),now=Date.now();
 data.historyDataCutoff=new Date(now-960000).toISOString();
 data.history=[{t:new Date(now-172800000).toISOString(),c:9,l:8}];
 data.cache.history={state:'fresh',checkedAt:new Date(now).toISOString(),freshUntil:new Date(now+86400000).toISOString()};
 globalThis.window={fetch:async()=>Response.json(data)};
 const source=readFileSync(new URL('../../site/market-data.js',import.meta.url),'utf8');
 const ui=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const result=await ui.loadPrices({stocks:[{symbol:'AAPL',target:8,history:[]}]});
 assert.equal(result.stocks[0].price,10);assert.equal(result.stocks[0].history.length,1);
 assert.match(ui.priceState('AAPL').error,/Latest price stale; last fetched/);
 assert.match(result.stocks[0]._priceError,/Latest price stale/);
});
