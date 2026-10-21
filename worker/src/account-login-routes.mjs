import {CHALLENGE_COOKIE} from './account-identity.mjs';
import {readBoundedJson} from './account-google-keys.mjs';
const paths=new Set(['/v1/auth/start','/v1/auth/complete','/v1/auth/logout']);
const reply=(body,status=200,cookies=[])=>{const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'});for(const value of cookies)headers.append('Set-Cookie',value);return new Response(JSON.stringify(body),{status,headers});};
function challengeCookie(request){
 const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(CHALLENGE_COOKIE+'='));
 if(values.length!==1)return null;const value=values[0].slice(CHALLENGE_COOKIE.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
// Internal same-origin JSON callback routes, not Google's direct form POST mode.
export function createLoginRoutes({enabled=false,allowedOrigin,identity,limit}={}){
 let ready=false;
 try{const url=new URL(allowedOrigin);ready=enabled===true&&url.protocol==='https:'&&url.origin===allowedOrigin&&['beginLogin','completeLogin','logout'].every(k=>typeof identity?.[k]==='function')&&typeof limit==='function';}catch{}
 return async request=>{
  const url=new URL(request.url);
  if(!paths.has(url.pathname))return reply({error:'Not found'},404);
  if(!ready)return reply({error:'Login unavailable'},503);
  if(url.origin!==allowedOrigin||request.headers.get('Origin')!==allowedOrigin||(request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))return reply({error:'Origin not allowed'},403);
  if(url.search)return reply({error:'Query parameters not accepted'},400);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'JSON required'},415);
  try{if(await limit(request,url.pathname)!==true)return reply({error:'Too many requests'},429);}catch{return reply({error:'Login unavailable'},503);}
  let body;try{body=await readBoundedJson(request,18000);}catch{return reply({error:'Invalid login request'},400);}
  if(body===null||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid login request'},400);
  const complete=url.pathname==='/v1/auth/complete';
  if(complete?(Object.keys(body).length!==1||!Object.hasOwn(body,'idToken')||typeof body.idToken!=='string'||!body.idToken||body.idToken.length>16384):Object.keys(body).length!==0)return reply({error:'Invalid login request'},400);
  try{
   if(url.pathname==='/v1/auth/start'){
    const result=await identity.beginLogin();return reply({nonce:result.nonce},200,[result.setCookie]);
   }
   if(complete){
    const challenge=challengeCookie(request);if(!challenge)return reply({error:'Invalid login'},401);
    const result=await identity.completeLogin({challenge,idToken:body.idToken});return reply({ok:true},200,[result.setCookie,result.clearChallenge]);
   }
   const result=await identity.logout(request);return reply({ok:true},200,[result.setCookie]);
  }catch(e){return ['Invalid identity','Invalid login challenge'].includes(e?.message)?reply({error:'Invalid login'},401):reply({error:'Login unavailable'},503);}
 };
}
