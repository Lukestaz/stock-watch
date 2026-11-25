import {createVerificationClient} from './account-alert-settings.mjs';
const path='/api/v1/alert-consent/email';
const rev=v=>Number.isSafeInteger(v)&&v>=0;
const pausedOthers=(state,symbol)=>state?.destination?.enabled!==true&&state?.stocks.some(x=>x.emailEnabled&&x.symbol!==symbol);
export function createEmailConsentClient({fetcher=globalThis.fetch}={}){
 let state=null,generation=0,active=null;
 const reset=()=>{generation++;active?.abort();active=null;state=null;};
 const view=()=>state?{revision:state.revision,destination:state.destination?{...state.destination}:null,stocks:state.stocks.map(x=>({...x}))}:null;
 async function run(method,body){
  active?.abort();const version=++generation,controller=new AbortController();active=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(method==='PUT'?{'Content-Type':'application/json','X-Watchlist-Account':state.account}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(version!==generation)return {kind:'stale'};
   if(!response.ok){if([401,409].includes(response.status))state=null;return {kind:response.status===401?'signed-out':response.status===409?'conflict':response.status===429?'rate-limited':'unavailable'};}
   const data=await response.json();if(version!==generation)return {kind:'stale'};
   if(method==='GET'){
    const account=response.headers.get('X-Watchlist-Account');
    if(!account||account.length>256||!rev(data.revision)||!Array.isArray(data.stocks)||data.stocks.length>100||data.stocks.some(x=>typeof x.symbol!=='string'||!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(x.symbol)||!rev(x.targetRevision)||typeof x.emailEnabled!=='boolean')||(data.destination!==null&&(!data.destination||!rev(data.destination.revision)||typeof data.destination.verified!=='boolean'||typeof data.destination.enabled!=='boolean')))throw Error();
    state={...data,account};return {kind:'loaded'};
   }
   if(!state||data.revision!==state.revision+1||data.enabled!==body.enabled)throw Error();
   const stocks=state.stocks.map(x=>x.symbol===body.symbol?{...x,emailEnabled:body.enabled}:x);
   state={...state,revision:data.revision,stocks,destination:state.destination?{...state.destination,enabled:body.enabled?true:stocks.some(x=>x.emailEnabled)?state.destination.enabled:false}:null};
   return {kind:'saved'};
  }catch{return {kind:version!==generation?'stale':'unavailable'};}
  finally{clearTimeout(timer);if(version===generation)active=null;}
 }
 return {view,reset,load:()=>{state=null;return run('GET');},save:(symbol,enabled)=>{
  const stock=state?.stocks.find(x=>x.symbol===symbol);
  if(!stock||typeof enabled!=='boolean'||(enabled&&state.destination?.verified!==true))return Promise.resolve({kind:'unavailable'});
  if(enabled&&pausedOthers(state,symbol))return Promise.resolve({kind:'paused-selection'});
  return run('PUT',{symbol,enabled,expectedWatchlistRevision:state.revision,expectedTargetRevision:stock.targetRevision,expectedDestinationRevision:state.destination?.revision??null});
 }};
}
export function mountFriendsEmailSettings({root,session,enrollmentAvailable=false,fetcher=globalThis.fetch}={}){
 const doc=root.ownerDocument,consent=createEmailConsentClient({fetcher}),verification=createVerificationClient({fetcher});
 const make=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=make('section');panel.setAttribute('aria-label','Email stock alerts');
 const title=make('h2','Email stock alerts'),note=make('p','Verify your email, then choose alerts for each saved stock. Uses delayed data. Turn off alerts before editing your watchlist; reload the editor after changing alert settings.');
 const email=make('input');email.type='email';email.maxLength=254;email.autocomplete='email';
 const emailLabel=make('label','Email address ');emailLabel.append(email);
 const token=make('input');token.type='text';token.maxLength=64;token.autocomplete='one-time-code';
 const tokenLabel=make('label','Verification code ');tokenLabel.append(token);
 const button=text=>{const b=make('button',text);b.type='button';return b;};
 const send=button('Send verification code'),verify=button('Verify email'),refresh=button('Refresh alert settings'),status=make('p'),list=make('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(title,note,emailLabel,send,tokenLabel,verify,refresh,status,list);root.append(panel);
 let signedIn=false,busy=false,version=0,canEnroll=enrollmentAvailable===true;
 const messages={loaded:'Choose each stock’s email setting. Opt-in waits for a new delayed observation.',saved:'Saved. Reload the watchlist editor before editing targets.',sent:'Check your inbox for the latest verification code.',verified:'Email verified. Choose stocks below; alerts are not enabled automatically.',conflict:'Account, target or settings changed. Refresh before saving.','account-changed':'Account changed. Check account sign-in before continuing.','paused-selection':'Turn off the other paused stock selections before enabling or resuming this stock.','signed-out':'Session expired. Check account sign-in.','rate-limited':'Too many requests. Wait before trying again.',invalid:'Check your email address or verification code.',unavailable:'Email alerts unavailable. Check your inbox before requesting another code.'};
 const unsaved=()=>typeof session.hasUnsaved==='function'&&session.hasUnsaved();
 function render(){
  for(const n of [email,token,send,verify,refresh])n.disabled=!signedIn||busy;
  list.replaceChildren();if(!signedIn)return;const state=consent.view();if(!state)return;
  const verified=state.destination?.verified===true;list.append(make('p',verified?'Email verified.':'Verify an email before turning alerts on.'));
  if(!canEnroll)list.append(make('p','New alert enrolment is paused. Existing alerts can still be turned off.'));
  const selected=state.stocks.filter(x=>x.emailEnabled);
  if(state.destination?.enabled!==true&&selected.length>1)list.append(make('p','Multiple stock selections are paused. Turn off the paused selections, then explicitly turn on each stock you want.'));
  if(verified&&state.destination.enabled!==true&&selected.length===1){
   const resume=button('Resume selected alerts');resume.disabled=busy||unsaved()||!canEnroll;
   resume.onclick=()=>{if(unsaved()){status.textContent='Save or discard pending watchlist edits first.';return;}void act(()=>consent.save(selected[0].symbol,true));};list.append(resume);
  }
  for(const stock of state.stocks){
   const row=make('p',stock.symbol+' · Email alerts '+(stock.emailEnabled?(verified&&state.destination?.enabled===true?'ON':'PAUSED'):'OFF')+' '),toggle=button(stock.emailEnabled?'Turn off':'Turn on');
   toggle.disabled=busy||unsaved()||(!stock.emailEnabled&&(!verified||!canEnroll||pausedOthers(state,stock.symbol)));
   toggle.onclick=()=>{if(unsaved()){status.textContent='Save or discard pending watchlist edits first.';return;}void act(()=>consent.save(stock.symbol,!stock.emailEnabled));};row.append(toggle);list.append(row);
  }
 }
 async function act(action){
  if(!signedIn||busy)return;busy=true;const attempt=version;render();status.textContent='Working…';
  const result=await action(attempt);if(attempt!==version||result.kind==='stale')return;
  busy=false;status.textContent=messages[result.kind]||messages.unavailable;
  if(result.kind==='signed-out'||result.kind==='account-changed'){version++;signedIn=false;consent.reset();verification.reset();email.value=token.value='';}
  render();
 }
 send.onclick=()=>void act(async attempt=>{const r=await verification.register(email.value);if(attempt!==version)return {kind:'stale'};if(r.kind==='signed-out'||r.kind==='account-changed')return r;const loaded=await consent.load();return loaded.kind==='loaded'?r:loaded;});
 verify.onclick=()=>void act(async attempt=>{const r=await verification.verify(token.value);if(attempt!==version)return {kind:'stale'};if(r.kind!=='verified')return r;token.value='';const loaded=await consent.load();return loaded.kind==='loaded'?{kind:'verified'}:loaded;});
 refresh.onclick=()=>void act(()=>consent.load());
 const unsubscribe=session.subscribe(value=>{version++;consent.reset();verification.reset();email.value=token.value='';busy=false;signedIn=value==='signed-in';status.textContent=signedIn?'Loading alert settings…':'Sign in to manage email alerts.';render();if(signedIn)void act(()=>consent.load());});
 return {setEnrollmentAvailable(value){canEnroll=value===true;render();},destroy(){version++;consent.reset();verification.reset();unsubscribe();panel.remove();}};
}
