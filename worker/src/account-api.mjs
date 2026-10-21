const MAX_BYTES=32768;
const reply=(body,status=200,account)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff',...(account?{'X-Watchlist-Account':account}:{})}});
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validateUpdate(value){
 if(!exact(value,['expectedRevision','stocks'])||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||value.expectedRevision>=Number.MAX_SAFE_INTEGER||!Array.isArray(value.stocks)||value.stocks.length>100)throw Error('Invalid update');
 const seen=new Set();
 const stocks=value.stocks.map(s=>{
  if(!exact(s,['symbol','target','alertsEnabled'])||typeof s.symbol!=='string'||!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(s.symbol)||seen.has(s.symbol)||typeof s.target!=='number'||!Number.isFinite(s.target)||s.target<=0||s.target>1e9||typeof s.alertsEnabled!=='boolean')throw Error('Invalid stock');
  seen.add(s.symbol);return {symbol:s.symbol,target:s.target,alertsEnabled:s.alertsEnabled};
 });
 return {expectedRevision:value.expectedRevision,stocks};
}
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('Body too large');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// authenticate verifies the session; client account headers are preconditions only.
export function createWatchlistApi({allowedOrigin,authenticate,store}={}){
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!=='/v1/watchlist')return reply({error:'Not found'},404);
  if(!allowedOrigin||typeof authenticate!=='function'||typeof store?.read!=='function'||typeof store?.replace!=='function')return reply({error:'Account service not configured'},503);
  if(request.headers.get('Origin')!==allowedOrigin)return reply({error:'Origin not allowed'},403);
  if(url.search)return reply({error:'Query parameters not accepted'},400);
  if(!['GET','PUT'].includes(request.method))return reply({error:'Method not allowed'},405);
  let principal;
  try{principal=await authenticate(request);}catch{return reply({error:'Authentication unavailable'},503);}
  if(!principal||typeof principal.userId!=='string'||!principal.userId)return reply({error:'Sign in required'},401);
  try{
   if(request.method==='GET')return reply(await store.read(principal.userId),200,principal.userId);
   const expectedAccount=request.headers.get('X-Watchlist-Account');
   if(expectedAccount!==null&&expectedAccount!==principal.userId)return reply({error:'Account changed; reload before saving'},409);
   if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'JSON required'},415);
   let update;try{update=validateUpdate(await readBody(request));}catch{return reply({error:'Invalid watchlist update'},400);}
   if(update.stocks.some(s=>s.alertsEnabled))return reply({error:'Alert enrollment not available yet'},409);
   const result=await store.replace(principal.userId,update.expectedRevision,update.stocks);
   if(result===null)return reply({error:'Watchlist changed; reload before saving'},409);
   return reply(result,200,principal.userId);
  }catch{return reply({error:'Account storage unavailable'},503);}
 };
}
