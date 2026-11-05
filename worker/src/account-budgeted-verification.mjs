// Fully composed candidate only; production runtime does not import this module.
import {createIdentityService} from './account-identity.mjs';
import {createAlertDestinationRoutes} from './account-alert-destinations.mjs';
import {createD1AlertDestinationStore} from './account-alert-destination-store.mjs';
import {createD1VerificationMailBudget} from './account-verification-mail-budget.mjs';
import {createVerificationMailer} from './account-verification-mailer.mjs';
const paths=new Set(['/v1/alert-destination/email','/v1/alert-destination/email/verify']);
const reject=(error,status)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function validSender(value){
 if(typeof value!=='string'||value.length>254||value!==value.trim())return false;
 const p=value.split('@');
 return p.length===2&&p[0].length>0&&p[0].length<=64&&!p[0].startsWith('.')&&!p[0].endsWith('.')&&!p[0].includes('..')&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(p[0])&&p[1].split('.').length>=2&&p[1].split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
export function createBudgetedAlertDestinationApi({enabled=false,allowedOrigin,db,clientId,loadGoogleKeys,admit,limit,from,send,limits={},emailProvider='shared-smtp',clock=()=>Math.floor(Date.now()/1000)}={}){
 let ready=false,identity,store,reserve;
 if(enabled===true){
  try{
   const url=new URL(allowedOrigin);
   if(url.protocol!=='https:'||url.origin!==allowedOrigin||typeof clientId!=='string'||!clientId.trim()||typeof clock!=='function'||typeof admit!=='function'||typeof limit!=='function'||typeof send!=='function'||!validSender(from))throw Error();
   identity=createIdentityService({db,clientId,loadGoogleKeys,clock});
   store=createD1AlertDestinationStore(db,{emailProvider});reserve=createD1VerificationMailBudget(db,limits);ready=true;
  }catch{ready=false;}
 }
 return async request=>{
  try{
   const url=new URL(request.url);
   if(!paths.has(url.pathname))return reject('Not found',404);
   if(!ready)return reject('Verification integration unavailable',503);
   if(url.origin!==allowedOrigin||request.headers.get('Origin')!==allowedOrigin||(request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))return reject('Origin not allowed',403);
   if(await admit(request)!==true)return reject('Too many requests',429);
   // This capability is confined to one request; no shared in-memory queue.
   let permit=null;
   const guardedStore={
    completeEmailVerification:value=>store.completeEmailVerification(value),
    async beginEmailVerification(value){
     const destinationHash=await hash(value.address.toLowerCase());
     if(await reserve({userId:value.userId,destinationHash,now:value.now})!==true)return false;
     const ok=await store.beginEmailVerification(value);
     if(ok===true)permit={...value,destinationHash,used:false};
     return ok;
    }
   };
   const mail=createVerificationMailer({enabled:true,from,send,clock,reserve:async value=>{
    if(!permit||permit.used||value.userId!==permit.userId||value.destinationHash!==permit.destinationHash||value.now<permit.now||value.now>=permit.expiresAt)return false;
    permit.used=true;return true;
   }});
   const sendVerification=async value=>{
    if(!permit||permit.used||value.userId!==permit.userId||value.to!==permit.address||value.expiresAt!==permit.expiresAt||await hash(value.token)!==permit.challengeHash)return false;
    return mail(value);
   };
   const routes=createAlertDestinationRoutes({enabled:true,allowedOrigin,authenticate:value=>identity.authenticate(value),limit,store:guardedStore,sendVerification,clock});
   return await routes(request);
  }catch{return reject('Verification integration unavailable',503);}
 };
}
