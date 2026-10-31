// Candidate consent API only. Requires explicit runtime and enrolment gates.
const root='/v1/alert-consent/email';
const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});
async function bodyOf(request){
 const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2048){await reader.cancel();throw Error();}chunks.push(r.value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(size);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export function createAccountAlertConsentApi({enabled=false,enrollmentEnabled=false,allowedOrigin,authenticate,admit,limit,store,clock=()=>Math.floor(Date.now()/1000)}={}){
 let ready=false;try{const u=new URL(allowedOrigin);ready=enabled===true&&u.protocol==='https:'&&u.origin===allowedOrigin&&[authenticate,admit,limit,clock,store?.read,store?.setEmailConsent].every(x=>typeof x==='function');}catch{}
 return async request=>{
  const url=new URL(request.url);if(url.pathname!==root)return reply({error:'Not found'},404);if(!ready)return reply({error:'Alert consent unavailable'},503);
  if(url.origin!==allowedOrigin||request.headers.get('Origin')!==allowedOrigin||(request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))return reply({error:'Origin not allowed'},403);
  if(url.search)return reply({error:'Query parameters not accepted'},400);if(!['GET','PUT'].includes(request.method))return reply({error:'Method not allowed'},405);
  try{
   if(await admit(request)!==true)return reply({error:'Too many requests'},429);
   const principal=await authenticate(request);if(!principal||typeof principal.userId!=='string'||!principal.userId||principal.userId.length>256)return reply({error:'Sign in required'},401);
   if(await limit(request,principal.userId,url.pathname)!==true)return reply({error:'Too many requests'},429);
   if(request.method==='GET'){const value=await store.read(principal.userId);return value?reply(value,200):reply({error:'Account unavailable'},404);}
   if(request.headers.get('X-Watchlist-Account')!==principal.userId)return reply({error:'Account changed; reload before saving'},409);
   if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'JSON required'},415);
   let body;try{body=await bodyOf(request);}catch{return reply({error:'Invalid consent request'},400);}
   const keys=['symbol','enabled','expectedWatchlistRevision','expectedTargetRevision','expectedDestinationRevision'];
   const rev=v=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER;
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==keys.length||!keys.every(k=>Object.hasOwn(body,k))||typeof body.symbol!=='string'||!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(body.symbol)||typeof body.enabled!=='boolean'||!rev(body.expectedWatchlistRevision)||!rev(body.expectedTargetRevision)||(body.expectedDestinationRevision!==null&&!rev(body.expectedDestinationRevision))||(body.enabled&&!(body.expectedDestinationRevision>0)))return reply({error:'Invalid consent request'},400);
   if(body.enabled&&enrollmentEnabled!==true)return reply({error:'Alert enrollment unavailable'},409);
   const result=await store.setEmailConsent({...body,userId:principal.userId,now:clock()});return result?reply(result,200):reply({error:'Watchlist or verified destination changed; reload before saving'},409);
  }catch{return reply({error:'Alert consent unavailable'},503);}
 };
}
