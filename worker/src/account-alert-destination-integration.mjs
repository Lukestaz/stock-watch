// Disabled candidate composition. Never imported by account-runtime.mjs.
import {createIdentityService} from './account-identity.mjs';
import {createAlertDestinationRoutes} from './account-alert-destinations.mjs';
import {createD1AlertDestinationStore} from './account-alert-destination-store.mjs';
const paths=new Set(['/v1/alert-destination/email','/v1/alert-destination/email/verify']);
const reject=(error,status)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});
export function createSessionAlertDestinationApi({enabled=false,allowedOrigin,db,clientId,loadGoogleKeys,admit,limit,sendVerification,clock=()=>Math.floor(Date.now()/1000),emailProvider='shared-smtp'}={}){
 let handler=null;
 if(enabled===true){
  try{
   const origin=new URL(allowedOrigin);
   if(origin.protocol!=='https:'||origin.origin!==allowedOrigin||typeof clientId!=='string'||!clientId.trim()||typeof clock!=='function'||typeof admit!=='function'||typeof limit!=='function'||typeof sendVerification!=='function')throw Error();
   const identity=createIdentityService({db,clientId,loadGoogleKeys,clock});
   handler=createAlertDestinationRoutes({enabled:true,allowedOrigin,authenticate:request=>identity.authenticate(request),limit,store:createD1AlertDestinationStore(db,{emailProvider}),sendVerification,clock});
  }catch{handler=null;}
 }
 return async request=>{
  try{
   const url=new URL(request.url);
   if(!paths.has(url.pathname))return reject('Not found',404);
   if(!handler)return reject('Destination integration unavailable',503);
   if(url.origin!==allowedOrigin||request.headers.get('Origin')!==allowedOrigin||(request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))return reject('Origin not allowed',403);
   if(await admit(request)!==true)return reject('Too many requests',429);
   return await handler(request);
  }catch{return reject('Destination integration unavailable',503);}
 };
}
