// Explicitly mounted preview only. No import, mount or network activity on load.
const base='/api/v1/alert-destination/email';
export function createVerificationClient({fetcher=globalThis.fetch}={}){
 let generation=0,active=null;
 const reset=()=>{generation++;active?.abort();active=null;};
 const run=async(mode,value)=>{
  if(typeof value!=='string'||(mode==='verify'?!/^[a-f0-9]{64}$/.test(value):value.length>254||!value||/[\r\n]/.test(value)))return {kind:'invalid'};
  reset();const version=generation,controller=new AbortController();active=controller;
  const timer=setTimeout(()=>controller.abort(),15000),stale=()=>version!==generation;
  const options={credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal};
  try{
   const account=await fetcher('/api/v1/watchlist',{...options,method:'GET',headers:{Accept:'application/json'}});
   if(stale())return {kind:'stale'};
   if(account.status===401)return {kind:'signed-out'};
   if(!account.ok)return {kind:'unavailable'};
   const principal=account.headers.get('X-Watchlist-Account');
   if(typeof principal!=='string'||!principal||principal.length>256||/[\r\n]/.test(principal))return {kind:'unavailable'};
   await account.body?.cancel();if(stale())return {kind:'stale'};
   const response=await fetcher(base+(mode==='verify'?'/verify':''),{...options,method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-Watchlist-Account':principal},body:JSON.stringify(mode==='verify'?{token:value}:{address:value})});
   if(stale())return {kind:'stale'};
   if(response.status===401)return {kind:'signed-out'};
   if(response.status===409)return {kind:'account-changed'};
   if(response.status===429)return {kind:'rate-limited'};
   if(response.status===400)return {kind:'invalid'};
   if(!response.ok)return {kind:'unavailable'};
   const result=await response.json();if(stale())return {kind:'stale'};
   if(mode==='verify')return response.status===200&&result.verified===true&&result.alertsEnabled===false?{kind:'verified'}:{kind:'unavailable'};
   return response.status===202&&result.ok===true?{kind:'sent'}:{kind:'unavailable'};
  }catch{return {kind:stale()?'stale':'unavailable'};}
  finally{clearTimeout(timer);if(version===generation)active=null;}
 };
 return {register:value=>run('register',value),verify:value=>run('verify',value),reset};
}
export function mountEmailVerificationPanel({root,session,enabled=false,fetcher=globalThis.fetch}={}){
 if(enabled!==true)return {destroy(){}};
 if(!root?.ownerDocument||typeof session?.subscribe!=='function')throw Error('Preview configuration required');
 const doc=root.ownerDocument,client=createVerificationClient({fetcher});
 const make=(tag,text)=>{const node=doc.createElement(tag);if(text)node.textContent=text;return node;};
 const panel=make('section');panel.setAttribute('aria-label','Email verification preview');
 const title=make('h2','Email verification (preview)'),note=make('p','Verifying an address does not enable stock alerts. Alert enrolment is not available yet.');
 const email=make('input');email.type='email';email.maxLength=254;email.autocomplete='email';
 const emailLabel=make('label','Email address ');emailLabel.append(email);
 const token=make('input');token.type='text';token.maxLength=64;token.autocomplete='one-time-code';token.spellcheck=false;
 const tokenLabel=make('label','Verification code ');tokenLabel.append(token);
 const send=make('button','Send verification code'),verify=make('button','Verify email');send.type=verify.type='button';
 const consent=make('button','Email price alerts — not available yet'),whatsapp=make('button','WhatsApp alerts — not available yet');consent.type=whatsapp.type='button';consent.disabled=whatsapp.disabled=true;
 const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(title,note,emailLabel,send,tokenLabel,verify,status,consent,whatsapp);root.append(panel);
 let signedIn=false,busy=false,version=0;
 const render=()=>{send.disabled=verify.disabled=!signedIn||busy;email.disabled=token.disabled=!signedIn||busy;};
 const unsubscribe=session.subscribe(value=>{version++;client.reset();signedIn=value==='signed-in';busy=false;email.value=token.value='';status.textContent=signedIn?'Enter your email address to request a code.':'Sign in to verify your email.';render();});
 const messages={sent:'Verification code requested. Check your inbox. Only the latest code is valid.',verified:'Email verified. Stock alerts remain off.','signed-out':'Session expired. Sign in again.','account-changed':'Account changed. Check your session and start again.','rate-limited':'Too many requests. Wait before trying again.',invalid:'Check the email address or verification code.',unavailable:'Verification unavailable. Do not repeatedly resend; check your inbox before retrying.'};
 async function act(mode){
  if(busy||!signedIn)return;busy=true;const attempt=version;render();status.textContent='Working…';
  const result=await client[mode](mode==='register'?email.value:token.value);
  if(attempt!==version||result.kind==='stale')return;
  busy=false;status.textContent=messages[result.kind]||messages.unavailable;
  if(result.kind==='verified')token.value='';
  if(result.kind==='signed-out'||result.kind==='account-changed'){version++;client.reset();signedIn=false;email.value=token.value='';}
  render();
 }
 send.onclick=()=>void act('register');verify.onclick=()=>void act('verify');
 return {destroy(){version++;client.reset();unsubscribe();panel.remove();}};
}
