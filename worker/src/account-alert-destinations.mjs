// Candidate routes only: not imported by the production runtime.
const ROOT='/v1/alert-destination/email';
const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});
const exact=(body,key)=>body!==null&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===1&&Object.hasOwn(body,key)&&typeof body[key]==='string';
async function bodyOf(request){
 const reader=request.body?.getReader();if(!reader)throw Error();
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function email(value){
 if(typeof value!=='string'||value.length>254||value!==value.trim()||!value.includes('@'))throw Error();
 const parts=value.split('@');
 if(parts.length!==2||parts[0].length>64||!parts[0]||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..')||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]))throw Error();
 const labels=parts[1].split('.');
 if(labels.length<2||labels.some(label=>!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)))throw Error();
 return parts[0]+'@'+parts[1].toLowerCase();
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async token=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
// Trusted store operations must be atomic and account/revision bound. See contract.
export function createAlertDestinationRoutes({enabled=false,allowedOrigin,authenticate,limit,store,sendVerification,clock=()=>Math.floor(Date.now()/1000)}={}){
 let ready=false;
 try{const url=new URL(allowedOrigin);ready=enabled===true&&url.protocol==='https:'&&url.origin===allowedOrigin&&typeof authenticate==='function'&&typeof limit==='function'&&typeof clock==='function'&&typeof sendVerification==='function'&&['beginEmailVerification','completeEmailVerification'].every(key=>typeof store?.[key]==='function');}catch{}
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!==ROOT&&url.pathname!==ROOT+'/verify')return reply({error:'Not found'},404);
  if(!ready)return reply({error:'Destination service unavailable'},503);
  if(url.origin!==allowedOrigin||request.headers.get('Origin')!==allowedOrigin||(request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))return reply({error:'Origin not allowed'},403);
  if(url.search)return reply({error:'Query parameters not accepted'},400);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'JSON required'},415);
  let principal;
  try{principal=await authenticate(request);}catch{return reply({error:'Authentication unavailable'},503);}
  if(!principal||typeof principal.userId!=='string'||!principal.userId||principal.userId.length>256)return reply({error:'Sign in required'},401);
  try{if(await limit(request,principal.userId,url.pathname)!==true)return reply({error:'Too many requests'},429);}catch{return reply({error:'Destination service unavailable'},503);}
  let body;try{body=await bodyOf(request);}catch{return reply({error:'Invalid destination request'},400);}
  const verifying=url.pathname.endsWith('/verify');
  if(!exact(body,verifying?'token':'address'))return reply({error:'Invalid destination request'},400);
  let address;
  try{if(verifying){if(!/^[a-f0-9]{64}$/.test(body.token))throw Error();}else address=email(body.address);}catch{return reply({error:'Invalid destination request'},400);}
  try{
   const now=clock();if(!Number.isSafeInteger(now)||now<=0||now>Number.MAX_SAFE_INTEGER-600)throw Error();
   if(verifying){
    const ok=await store.completeEmailVerification({userId:principal.userId,challengeHash:await hash(body.token),now});
    return ok===true?reply({verified:true,alertsEnabled:false},200):reply({error:'Invalid or expired verification'},400);
   }
   const token=hex(crypto.getRandomValues(new Uint8Array(32))),expiresAt=now+600;
   const ok=await store.beginEmailVerification({userId:principal.userId,address,challengeHash:await hash(token),now,expiresAt});
   if(ok!==true)throw Error();
   if(await sendVerification({userId:principal.userId,to:address,token,expiresAt})!==true)throw Error();
   return reply({ok:true},202);
  }catch{return reply({error:'Destination service unavailable'},503);}
 };
}
