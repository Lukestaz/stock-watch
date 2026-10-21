import {createWatchlistApi} from './account-api.mjs';
import {createD1WatchlistStore} from './account-store.mjs';
import {createIdentityService} from './account-identity.mjs';
const reject=(error,status)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});
// Non-production composition only. Not imported by the live Worker.
export function createSessionWatchlistApi({enabled=false,allowedOrigin,db,clientId,loadGoogleKeys,clock}={}){
 let handler;
 if(enabled===true){
  try{
   const origin=new URL(allowedOrigin);
   if(origin.protocol!=='https:'||origin.origin!==allowedOrigin)throw Error('Invalid origin');
   const identity=createIdentityService({db,clientId,loadGoogleKeys,clock});
   handler=createWatchlistApi({allowedOrigin,authenticate:request=>identity.authenticate(request),store:createD1WatchlistStore(db)});
  }catch{handler=null;}
 }
 return async request=>{
  try{
   const url=new URL(request.url);
   if(url.pathname!=='/v1/watchlist')return reject('Not found',404);
   if(!handler)return reject('Account integration unavailable',503);
   if(url.protocol!=='https:'||url.origin!==allowedOrigin)return reject('Origin not allowed',403);
   const site=request.headers.get('Sec-Fetch-Site');
   if(site!==null&&site!=='same-origin')return reject('Origin not allowed',403);
   // Browser same-origin GET fetches can omit Origin; this is not authentication.
   if(request.method==='GET'&&!request.headers.has('Origin')&&site==='same-origin'){
    const headers=new Headers(request.headers);headers.set('Origin',allowedOrigin);
    request=new Request(request,{headers});
   }
   return await handler(request);
  }catch{return reject('Account integration unavailable',503);}
 };
}
