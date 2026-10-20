import {accountSession} from './account-session.mjs';
const CLIENT_ID='19866673111-hg5958bvoiqoa5crrt0jmalvh1mssfvk.apps.googleusercontent.com';
const APP_ORIGIN='https://stock-watch-app.lukestaz.workers.dev';
if(location.origin===APP_ORIGIN)mount();else accountSession.set('guest');
function mount(){
 const header=document.querySelector('header');if(!header)return;
 const button=text=>{const b=document.createElement('button');b.type='button';b.textContent=text;return b;};
 const toggle=button('Sign in'),retry=button('Start Google sign-in'),logout=button('Sign out'),recheck=button('Check session');
 toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','account-panel');(header.querySelector('.nav-actions')||header).append(toggle);
 const panel=document.createElement('section');panel.id='account-panel';panel.hidden=true;panel.setAttribute('aria-label','Account sign-in');panel.style.cssText='margin:12px 0;padding:14px;border:1px solid #52647c;border-radius:10px';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const googleButton=document.createElement('div');googleButton.style.cssText='min-height:44px;max-width:100%;overflow:auto';
 const note=document.createElement('p');note.className='muted';note.textContent='Account edits save to the cloud. Guest edits stay on this device. Neither list is automatically copied into the other. Scheduled alerts are unchanged.';
 retry.hidden=logout.hidden=true;panel.append(status,googleButton,retry,logout,recheck,note);header.after(panel);
 let available=false,signedIn=false,busy=false,sdkPromise,generation=0,channel;try{channel=new BroadcastChannel('stock-watch-session');}catch{}
 const message=text=>{status.textContent=text;};
 const clearGoogle=()=>{generation++;googleButton.replaceChildren();};
 function session(value){signedIn=value;toggle.textContent=value?'Account':'Sign in';logout.hidden=!value;retry.hidden=value||!available;accountSession.set(value?'signed-in':'guest');}
 const api=(path,body)=>fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body===undefined?{Accept:'application/json'}:{'Content-Type':'application/json',Accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 function loadGoogle(){
  if(window.google?.accounts?.id)return Promise.resolve(window.google.accounts.id);if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(fail,15000);function fail(){clearTimeout(timer);script.remove();reject(Error('Google unavailable'));}script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;script.onload=()=>{clearTimeout(timer);if(window.google?.accounts?.id)resolve(window.google.accounts.id);else fail();};document.head.append(script);}).catch(error=>{sdkPromise=undefined;throw error;});return sdkPromise;
 }
 async function checkSession(){
  if(busy)return;busy=true;
  try{
   const health=await fetch('/api/health',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000)});if(!health.ok)throw Error();const h=await health.json();
   available=h.ok===true&&h.mode==='account-preview'&&h.database?.bound===true&&h.database?.ready===true;
   if(!available){if(accountSession.hasUnsaved()){message('Account service unavailable. Unsaved edits kept in this tab.');return;}session(false);message('Accounts are disabled. Guest changes stay on this device.');return;}
   const r=await api('watchlist');
   if(r.ok){session(true);message('Signed in. Check the watchlist editor for save status.');}
   else if(r.status===401){
    if(accountSession.hasUnsaved()){message('Session expired. Copy or discard unsaved edits before changing session.');return;}
    clearGoogle();session(false);message('Sign in with Google. Your guest list will not be uploaded.');
   }else throw Error();
  }catch{available=false;retry.hidden=true;if(!accountSession.hasUnsaved())accountSession.set('unavailable');message('Session check failed. Unsaved edits, if any, remain in this tab. Retry Check session.');}
  finally{busy=false;}
 }
 async function begin(){
  if(!available||signedIn||busy)return;busy=true;retry.disabled=true;clearGoogle();const attempt=generation;message('Preparing Google sign-in…');
  try{const r=await api('auth/start',{});if(!r.ok)throw Error();const data=await r.json();if(typeof data.nonce!=='string'||!/^[a-f0-9]{64}$/.test(data.nonce))throw Error();const id=await loadGoogle();if(attempt!==generation)return;
   id.initialize({client_id:CLIENT_ID,nonce:data.nonce,auto_select:false,ux_mode:'popup',context:'signin',callback:async result=>{
    if(attempt!==generation||busy||signedIn)return;if(typeof result?.credential!=='string'||!result.credential){clearGoogle();message('Google sign-in did not complete. Start again.');return;}if(!accountSession.canChange())return;
    busy=true;retry.disabled=true;clearGoogle();accountSession.set('checking');message('Completing sign-in…');
    try{const completed=await api('auth/complete',{idToken:result.credential});if(!completed.ok||(await completed.json()).ok!==true)throw Error();session(true);message('Signed in. Loading your account watchlist.');channel?.postMessage('changed');}
    catch{accountSession.set('unavailable');message('Could not confirm sign-in. Retry Check session. Guest saved data is unchanged.');}
    finally{busy=false;retry.disabled=false;}
   }});id.renderButton(googleButton,{type:'standard',theme:'outline',size:'large',text:'signin_with',width:240});message('Use the Google button below.');retry.textContent='Restart Google sign-in';
  }catch{clearGoogle();message('Sign-in unavailable. Try again later.');}finally{busy=false;retry.disabled=false;}
 }
 toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!available)void checkSession();else if(!panel.hidden&&!signedIn&&!googleButton.childElementCount)void begin();};
 retry.onclick=()=>void begin();recheck.onclick=()=>void checkSession();
 logout.onclick=async()=>{if(busy||!accountSession.canChange())return;busy=true;logout.disabled=true;accountSession.set('checking');
  try{const r=await api('auth/logout',{});if(!r.ok||(await r.json()).ok!==true)throw Error();clearGoogle();session(false);window.google?.accounts?.id?.disableAutoSelect();message('Signed out. Showing this device’s guest list.');channel?.postMessage('changed');}
  catch{accountSession.set('unavailable');message('Could not confirm sign-out. Check session or retry sign-out.');}finally{busy=false;logout.disabled=false;}
 };
 if(channel)channel.onmessage=e=>{if(e.data!=='changed'||busy)return;if(accountSession.hasUnsaved()){message('Session changed in another tab. Unsaved edits kept here; copy them before reloading or changing session.');return;}accountSession.set('checking');void checkSession();};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkSession();});message('Checking account availability…');void checkSession();
}
