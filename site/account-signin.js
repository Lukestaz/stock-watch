const CLIENT_ID = '19866673111-hg5958bvoiqoa5crrt0jmalvh1mssfvk.apps.googleusercontent.com';
const APP_ORIGIN = 'https://stock-watch-app.lukestaz.workers.dev';
if (location.origin === APP_ORIGIN) mountAccountControls();

function mountAccountControls() {
  const header = document.querySelector('header');
  if (!header) return;
  const button = (text) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; return b; };
  const toggle = button('Sign in'), retry = button('Start Google sign-in'), logout = button('Sign out');
  toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-controls','account-panel');
  (header.querySelector('.nav-actions') || header).append(toggle);
  const panel = document.createElement('section'); panel.id = 'account-panel'; panel.hidden = true;
  panel.setAttribute('aria-label','Account sign-in');
  panel.style.cssText = 'margin:12px 0;padding:14px;border:1px solid #52647c;border-radius:10px';
  const status = document.createElement('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const googleButton = document.createElement('div'); googleButton.style.cssText = 'min-height:44px;max-width:100%;overflow:auto';
  const note = document.createElement('p'); note.className = 'muted';
  note.textContent = 'Targets still save on this device only. Signing in does not upload, merge or sync your watchlist yet, or enable alerts.';
  retry.hidden = logout.hidden = true; panel.append(status,googleButton,retry,logout,note); header.after(panel);
  let available = false, signedIn = false, busy = false, sdkPromise, generation = 0;
  const message = text => { status.textContent = text; };
  const clearGoogle = () => { generation++; googleButton.replaceChildren(); };
  function session(value) { signedIn = value; toggle.textContent = value ? 'Account' : 'Sign in'; logout.hidden = !value; retry.hidden = value || !available; }
  const api = (path,body) => fetch('/api/v1/' + path, {
    method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store', redirect:'error',
    headers:body === undefined ? {Accept:'application/json'} : {'Content-Type':'application/json',Accept:'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(15000)
  });
  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(fail,15000);
      function fail() { clearTimeout(timer); script.remove(); reject(Error('Google unavailable')); }
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onerror = fail;
      script.onload = () => { clearTimeout(timer); if (window.google?.accounts?.id) resolve(window.google.accounts.id); else fail(); };
      document.head.append(script);
    }).catch(error => { sdkPromise = undefined; throw error; });
    return sdkPromise;
  }
  async function begin() {
    if (!available || signedIn || busy) return;
    busy = true; retry.disabled = true; clearGoogle(); const attempt = generation;
    message('Preparing Google sign-in…');
    try {
      const response = await api('auth/start',{}); if (!response.ok) throw Error('Unavailable');
      const data = await response.json();
      // The server returns the SHA-256 hex digest of its secure challenge cookie.
      if (typeof data.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(data.nonce)) throw Error('Invalid challenge');
      const id = await loadGoogle(); if (attempt !== generation) return;
      id.initialize({client_id:CLIENT_ID,nonce:data.nonce,auto_select:false,ux_mode:'popup',context:'signin',callback:async result => {
        if (attempt !== generation || busy || signedIn) return;
        if (typeof result?.credential !== 'string' || !result.credential) { clearGoogle(); message('Google sign-in did not complete. Please start again.'); return; }
        busy = true; retry.disabled = true; clearGoogle(); message('Completing sign-in…');
        try {
          const completed = await api('auth/complete',{idToken:result.credential});
          if (!completed.ok || (await completed.json()).ok !== true) throw Error('Login failed');
          session(true); message('Signed in. Watchlist syncing is not connected yet.');
        } catch { message('Could not complete sign-in. Please start again; local targets are unchanged.'); }
        finally { busy = false; retry.disabled = false; }
      }});
      id.renderButton(googleButton,{type:'standard',theme:'outline',size:'large',text:'signin_with',width:240});
      message('Use the Google button below. If the challenge expires, start again.'); retry.textContent = 'Restart Google sign-in';
    } catch { clearGoogle(); message('Sign-in is unavailable. Try again later; local targets are unchanged.'); }
    finally { busy = false; retry.disabled = false; }
  }
  toggle.addEventListener('click',() => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded',String(!panel.hidden)); if (!panel.hidden && available && !signedIn && !googleButton.childElementCount) void begin(); });
  retry.addEventListener('click',() => void begin());
  logout.addEventListener('click',async () => {
    if (busy) return; busy = true; logout.disabled = true;
    try {
      const response = await api('auth/logout',{}); if (!response.ok || (await response.json()).ok !== true) throw Error('Logout failed');
      clearGoogle(); session(false); window.google?.accounts?.id?.disableAutoSelect(); message('Signed out. Local targets are unchanged.');
    } catch { message('Could not confirm sign-out. Please retry.'); }
    finally { busy = false; logout.disabled = false; }
  });
  message('Checking account availability…');
  void (async () => {
    try {
      const health = await fetch('/api/health',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000)});
      if (!health.ok) throw Error('Unavailable'); const state = await health.json();
      available = state.ok === true && state.mode === 'account-preview' && state.database?.bound === true && state.database?.ready === true;
      if (!available) { message('Account sign-in is not enabled yet. Your local watchlist still works.'); return; }
      const response = await api('watchlist');
      if (response.ok) { session(true); message('Signed in. Watchlist syncing is not connected yet.'); }
      else if (response.status === 401) { session(false); message('Sign in with Google. Local targets will not be uploaded.'); }
      else throw Error('Unavailable');
    } catch { available = false; retry.hidden = true; message('Account service unavailable. Your local watchlist still works.'); }
  })();
}
