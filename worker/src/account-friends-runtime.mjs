// Default-off runtime integration; credentials come only from deployment bindings.
import {createGmailSmtpTransport} from './account-gmail-smtp.mjs';
import {createGmailVerificationService} from './account-gmail-verification-service.mjs';
import {createD1AccountAlertStore} from './account-alert-store.mjs';
import {createGmailFriendsDispatcher} from './account-gmail-friends-dispatcher.mjs';
import {createGoogleKeyLoader} from './account-google-keys.mjs';
const validTime=n=>Number.isSafeInteger(n)&&n>0;
const symbol=s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(s);
export function createAlpacaObservationSource({enabled=false,key,secret,fetcher=globalThis.fetch}={}){
 const credential=v=>typeof v==='string'&&v.length>0&&v.length<=256&&v===v.trim()&&!/[\r\n]/.test(v);
 const configured=enabled===true&&credential(key)&&credential(secret)&&typeof fetcher==='function';
 return {configured,async bars({symbol:stock,after,now}={}){
  if(!configured)return [];
  if(!symbol(stock)||!validTime(now)||!Number.isSafeInteger(after)||after<0)throw Error('Invalid observation request');
  const start=Math.max(after,now-3600),end=now-900;if(start>=end)return [];
  const url=new URL('https://data.alpaca.markets/v2/stocks/'+stock+'/bars');
  url.search=new URLSearchParams({start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString(),timeframe:'1Min',adjustment:'raw',feed:'sip',sort:'asc',limit:'1000'});
  const response=await fetcher(url.toString(),{redirect:'error',headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Market source unavailable');
  const reader=response.body?.getReader();if(!reader)throw Error('Market source unavailable');const chunks=[];let size=0;
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>262144){await reader.cancel();throw Error('Market response too large');}chunks.push(r.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!Array.isArray(data.bars)||data.bars.length>1000||data.next_page_token)throw Error('Unexpected market response');
  return data.bars.map(b=>({symbol:stock,low:b.l,close:b.c,observedAt:Math.floor(Date.parse(b.t)/1000),now})).filter(b=>
   Number.isFinite(b.low)&&typeof b.low==='number'&&Number.isFinite(b.close)&&typeof b.close==='number'&&b.low>0&&b.low<=b.close&&b.close<=1e9&&validTime(b.observedAt)&&b.observedAt>after&&now-b.observedAt>=900&&now-b.observedAt<=3600
  ).sort((a,b)=>a.observedAt-b.observedAt);
 }};
}
export function createFriendsSchedule({enabled=false,db,source,producer,dispatcher,cleanup,clock=()=>Math.floor(Date.now()/1000),maxSymbols=20}={}){
 const ready=enabled===true&&typeof db?.prepare==='function'&&typeof db?.batch==='function'&&source?.configured===true&&typeof source.bars==='function'&&typeof producer?.evaluate==='function'&&typeof dispatcher?.run==='function'&&typeof cleanup==='function'&&typeof clock==='function'&&Number.isInteger(maxSymbols)&&maxSymbols>0&&maxSymbols<=100;
 return {async run(){
  const result={status:'disabled',symbols:0,observations:0,eventsCreated:0,accepted:0,deferred:0,failed:0,uncertain:0,errors:0};if(!ready)return result;
  try{
   const now=clock();if(!validTime(now))throw Error();
   const sql=`SELECT e.symbol,min(m.last_observed_at) AS after FROM watchlist_entries e
    JOIN account_alert_monitors m ON m.user_id=e.user_id AND m.symbol=e.symbol AND m.target_revision=e.target_revision
    JOIN alert_destinations d ON d.user_id=e.user_id AND d.channel='email'
    WHERE e.alerts_enabled=1 AND e.email_enabled=1 AND d.enabled=1 AND d.verified_at IS NOT NULL
     AND d.provider='shared-smtp' AND d.provider_binding_ref IS NULL GROUP BY e.symbol ORDER BY e.symbol LIMIT ?`;
   const r=await db.batch([db.prepare(sql).bind(maxSymbols+1)]);
   if(!Array.isArray(r)||r[0]?.success!==true||!Array.isArray(r[0].results))throw Error();
   if(r[0].results.length>maxSymbols)return {...result,status:'capacity'};
   for(const row of r[0].results){
    result.symbols++;
    try{
     const bars=await source.bars({symbol:row.symbol,after:row.after,now});if(!Array.isArray(bars)||bars.length>1000)throw Error();
     for(const bar of [...bars].sort((a,b)=>a.observedAt-b.observedAt)){
      const out=await producer.evaluate({...bar,symbol:row.symbol,now});result.observations++;result.eventsCreated+=out.eventsCreated;
     }
    }catch{result.errors++;}
   }
   const sent=await dispatcher.run({limit:10});result.accepted=sent.accepted;result.deferred=sent.deferred||0;result.failed=sent.failed||0;result.uncertain=sent.uncertain||0;if(result.failed||result.uncertain)result.errors++;
   try{await cleanup();}catch{result.errors++;}
   result.status=result.errors?'partial':'ok';return result;
  }catch{return {...result,status:'unavailable',errors:result.errors+1};}
 }};
}
const off=()=>({ready:false,enrollmentEnabled:false,scheduledConfigured:false,fetch:async()=>Response.json({error:'Friends alerts unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}),scheduled:async()=>({status:'disabled'})});
export async function createFriendsRuntime({env={},connect,fetcher=globalThis.fetch,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(env.ACCOUNTS_ENABLED!=='true'||env.FRIENDS_ALERTS_ENABLED!=='true')return off();
 try{
  const origin=new URL(env.APP_ORIGIN);
  if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||typeof env.GOOGLE_CLIENT_ID!=='string'||!env.GOOGLE_CLIENT_ID.trim()||typeof env.ACCOUNT_LIMIT?.limit!=='function'||typeof env.DB?.prepare!=='function'||typeof env.DB?.batch!=='function'||typeof env.GMAIL_USER!=='string'||typeof env.GMAIL_APP_PASSWORD!=='string'||typeof fetcher!=='function'||typeof clock!=='function')return off();
  const required=['users','sessions','watchlists','watchlist_entries','alert_destinations','alert_email_challenges','account_alert_monitors','account_alert_events','account_alert_deliveries','verification_request_attempts','verification_mail_reservations'];
  const r=await env.DB.batch([env.DB.prepare("SELECT name FROM sqlite_schema WHERE type='table'").bind(),env.DB.prepare('PRAGMA table_info(account_alert_deliveries)').bind(),env.DB.prepare('PRAGMA table_info(verification_mail_reservations)').bind()]);
  if(!Array.isArray(r)||r.length!==3||r.some(x=>x.success!==true||!Array.isArray(x.results)))return off();
  const tables=new Set(r[0].results.map(x=>x.name)),columns=new Set(r[1].results.map(x=>x.name));
  if(required.some(x=>!tables.has(x))||['consent_revision','claim_token','claim_until','dispatch_token','send_started_at','last_error_category'].some(x=>!columns.has(x))||!r[2].results.some(x=>x.name==='purpose'))return off();
  const socketConnect=connect||(await import('cloudflare:sockets')).connect;
  const common={enabled:true,db:env.DB,connect:socketConnect,username:env.GMAIL_USER,appPassword:env.GMAIL_APP_PASSWORD,clock};
  if(!createGmailSmtpTransport(common).configured)return off();
  const source=createAlpacaObservationSource({enabled:true,key:env.ALPACA_KEY,secret:env.ALPACA_SECRET,fetcher});
  const scheduledConfigured=env.FRIENDS_SCHEDULE_ENABLED==='true'&&source.configured;
  const enrollmentEnabled=env.FRIENDS_ENROLLMENT_ENABLED==='true'&&scheduledConfigured;
  const loadGoogleKeys=createGoogleKeyLoader({fetcher,clock:()=>clock()*1000});
  const service=createGmailVerificationService({...common,enrollmentEnabled,allowedOrigin:env.APP_ORIGIN,clientId:env.GOOGLE_CLIENT_ID,loadGoogleKeys,admissionKey:async request=>{
   const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>256)return null;
   return (await env.ACCOUNT_LIMIT.limit({key:'friends:'+ip}))?.success===true?ip:null;
  }});
  const schedule=createFriendsSchedule({enabled:scheduledConfigured,db:env.DB,source,producer:createD1AccountAlertStore(env.DB,{evaluationEnabled:scheduledConfigured}),dispatcher:createGmailFriendsDispatcher({...common,enabled:scheduledConfigured}),cleanup:()=>service.cleanup(),clock});
  return {ready:true,enrollmentEnabled,scheduledConfigured,async fetch(request){
   const u=new URL(request.url);if(u.pathname.startsWith('/api/'))u.pathname=u.pathname.slice(4);
   const headers=new Headers(request.headers);
   if(request.method==='GET'&&u.origin===env.APP_ORIGIN&&!headers.has('Origin')&&headers.get('Sec-Fetch-Site')==='same-origin')headers.set('Origin',env.APP_ORIGIN);
   return service.fetch(new Request(u.toString(),{...{method:request.method,headers,redirect:'error'},...(['GET','HEAD'].includes(request.method)?{}:{body:request.body,duplex:'half'})}));
  },scheduled:()=>schedule.run()};
 }catch{return off();}
}
