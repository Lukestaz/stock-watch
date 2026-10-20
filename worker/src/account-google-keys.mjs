export const GOOGLE_JWKS_URL='https://www.googleapis.com/oauth2/v3/certs';
export async function readBoundedJson(input,maxBytes){
 const reader=input.body?.getReader();if(!reader)throw Error('Missing body');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('Body too large');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function createGoogleKeyLoader({fetcher=fetch,clock=Date.now,timeoutMs=5000}={}){
 if(typeof fetcher!=='function'||typeof clock!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid key loader configuration');
 let cache=[],expires=0,retryAt=0,pending;
 const copy=keys=>keys.map(k=>({...k}));
 async function refresh(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(GOOGLE_JWKS_URL,{redirect:'manual',credentials:'omit',headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok||response.redirected||response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json'){await response.body?.cancel();throw Error();}
   const body=await readBoundedJson(response,65536),seen=new Set();
   if(!Array.isArray(body.keys)||body.keys.length<1||body.keys.length>10)throw Error();
   const keys=body.keys.map(k=>{
    if(!k||k.kty!=='RSA'||k.alg!=='RS256'||k.use!=='sig'||typeof k.kid!=='string'||!k.kid||k.kid.length>200||seen.has(k.kid)||typeof k.n!=='string'||!/^[A-Za-z0-9_-]{300,1400}$/.test(k.n)||typeof k.e!=='string'||!/^[A-Za-z0-9_-]{3,16}$/.test(k.e)||['d','p','q','dp','dq','qi','oth'].some(field=>Object.hasOwn(k,field)))throw Error();
    seen.add(k.kid);return {kty:'RSA',alg:'RS256',use:'sig',kid:k.kid,n:k.n,e:k.e};
   });
   const policy=response.headers.get('Cache-Control')||'',match=policy.match(/(?:^|,)\s*max-age=(\d+)/i);
   const age=Number(response.headers.get('Age')||0);
   const ttl=/no-store|no-cache/i.test(policy)?0:Math.max(0,Math.min(3600,match?Number(match[1]):0)-(Number.isFinite(age)&&age>=0?age:3600));
   cache=keys;expires=clock()+ttl*1000;retryAt=0;return keys;
  }catch{retryAt=clock()+5000;throw Error('Google keys unavailable');}
  finally{clearTimeout(timer);}
 }
 return async()=>{
  if(cache.length&&clock()<expires)return copy(cache);
  if(clock()<retryAt)throw Error('Google keys unavailable');
  if(!pending)pending=refresh().finally(()=>{pending=undefined;});
  return copy(await pending);
 };
}
