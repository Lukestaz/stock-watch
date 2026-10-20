export function normalizeSymbol(value){const s=String(value||'').trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(s))throw Error('Invalid symbol');return s;}
export function cleanBars(rows,end){return (rows||[]).filter(b=>b&&typeof b.t==='string'&&Number.isFinite(Date.parse(b.t))&&Date.parse(b.t)<=end&&['c','l'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])&&b[k]>0)).map(b=>({t:b.t,c:b.c,l:b.l})).sort((a,b)=>a.t.localeCompare(b.t));}
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}});
async function makeService(env){
 const [{createPriceCache},{createAlpacaLoader}]=await Promise.all([import('./price-cache.mjs'),import('./price-cache-alpaca.mjs')]);
 const trace={},labels=new WeakMap();
 const db={prepare(sql){return {bind(...args){try{
  const statement=env.DB.prepare(sql).bind(...args);labels.set(statement,sql.includes('SET payload=')?'save':'query');return statement;
 }catch(e){trace.database||={stage:'prepare-or-bind'};throw e;}}};},async batch(statements){
  try{const r=await env.DB.batch(statements);if(r.some(x=>x.success!==true))trace.database||={stage:statements.some(s=>labels.get(s)==='save')?'save':'query'};return r;}
  catch(e){trace.database||={stage:statements.some(s=>labels.get(s)==='save')?'save':'query'};throw e;}
 }};
 const loader=createAlpacaLoader({key:env.ALPACA_KEY,secret:env.ALPACA_SECRET,fetcher:async(input,init)=>{
  const kind=new URL(input).searchParams.get('timeframe')==='1Day'?'history':'latest';trace[kind]={stage:'network'};
  try{const r=await globalThis.fetch(input,init);trace[kind]={stage:'response',providerStatus:r.status};return r;}
  catch(e){trace[kind]={stage:'network',failure:['TypeError','AbortError','TimeoutError'].includes(e?.name)?e.name:'fetch-failed'};throw e;}
 }});
 const cache=createPriceCache({db,load:async(kind,symbol,options)=>{
  trace[kind]={stage:'budget-or-load'};
  try{const value=await loader(kind,symbol,options);trace[kind]={...trace[kind],stage:'decoded',
   payloadBytes:new TextEncoder().encode(JSON.stringify(value)).length,bars:Array.isArray(value.history)?value.history.length:0};return value;}
  catch(e){trace[kind]={...trace[kind],failure:['budget','rate-limit','not-found','pagination-limit'].includes(e?.code)?e.code:e?.name==='SyntaxError'?'invalid-json':'load-error'};throw e;}
 },dailyLimit:Number(env.PRICE_DAILY_LIMIT||5000),minuteLimit:Number(env.PRICE_MINUTE_LIMIT||100)});
 return {async get(symbol){try{
  const data=await cache.get(symbol);
  return [data.cache?.history?.state,data.cache?.latest?.state].includes('unavailable')?{...data,diagnostics:trace}:data;
 }catch(e){const failure=Error('Cache unavailable');failure.code=e?.code;failure.retryAt=e?.retryAt;failure.diagnostics=trace;throw failure;}},cleanup:()=>cache.cleanup()};
}
export function createPriceWorker({service=makeService,edge=()=>globalThis.caches?.default}={}){
 async function handle(request,env,ctx){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const configured=!!(env.ALPACA_KEY&&env.ALPACA_SECRET&&env.CLIENT_LIMIT&&env.UPSTREAM_LIMIT);
  if(!env.ALLOWED_ORIGIN)return json({error:'Origin configuration missing'},503);
  if(origin&&origin!==env.ALLOWED_ORIGIN)return json({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
  if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET, OPTIONS'});
  if(url.pathname==='/health'){
   let ready=false;
   if(configured&&env.DB){try{const r=await env.DB.batch([
    env.DB.prepare('SELECT 1 FROM price_cache_entries LIMIT 0'),env.DB.prepare('SELECT 1 FROM price_cache_budget LIMIT 0')]);
    ready=r.length===2&&r.every(x=>x.success===true);
   }catch{}}
   return json({ok:ready,mode:'d1-price-cache',build:env.BUILD_SHA||null},ready?200:503);
  }
  if(url.pathname!=='/v1/stock')return json({error:'Not found'},404);
  if(!configured)return json({error:'Price service setup incomplete'},503);
  let symbol;try{symbol=normalizeSymbol(url.searchParams.get('symbol'));}catch{return json({error:'Invalid ticker symbol'},400);}
  if(!(await env.CLIENT_LIMIT.limit({key:'prices:'+(request.headers.get('CF-Connecting-IP')||'unknown')})).success)return json({error:'Too many requests; retry shortly'},429,{'Retry-After':'60'});
  if(!env.DB)return json({error:'Price database unavailable'},503,{'Retry-After':'60'});
  const cache=edge(),key=new Request(url.origin+'/__price-cache-v2?symbol='+encodeURIComponent(symbol));
  try{const hit=await cache?.match(key);if(hit)return hit;}catch{}
  if(!(await env.UPSTREAM_LIMIT.limit({key:'provider-fetch'})).success)return json({error:'Service busy; retry shortly'},429,{'Retry-After':'60'});
  try{
   const data=await (await service(env)).get(symbol);
   const parts=[data.cache?.history,data.cache?.latest];
   const expires=Math.min(...parts.map(p=>Date.parse(p?.freshUntil)));
   const ttl=parts.every(p=>p?.state==='fresh')?Math.max(0,Math.min(60,Math.floor((expires-Date.now())/1000))):0;
   const response=json(data,200,ttl>0?{'Cache-Control':'public, max-age='+ttl}:{});
   if(ttl>0&&cache&&ctx?.waitUntil)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
   return response;
  }catch(e){
   const wait=Number.isSafeInteger(e?.retryAt)&&e.retryAt>Math.floor(Date.now()/1000)?Math.max(1,Math.min(86400,e.retryAt-Math.floor(Date.now()/1000))):60;
   const status=['budget','rate-limit'].includes(e?.code)?429:503;
   return json({error:'Market data temporarily unavailable; retry later',symbol,diagnostics:e?.diagnostics},status,{'Retry-After':String(wait)});
  }
 }
 return {async fetch(request,env,ctx){
  let response;try{response=await handle(request,env,ctx);}catch{response=json({error:'Price service temporarily unavailable'},503);}
  const r=new Response(response.body,response);r.headers.set('Access-Control-Allow-Origin',env.ALLOWED_ORIGIN||'null');
  r.headers.set('Vary','Origin');r.headers.set('X-Content-Type-Options','nosniff');return r;
 },async scheduled(event,env){await (await service(env)).cleanup();}};
}
export default createPriceWorker();
