const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
export function createWatchlistSync({fetcher = globalThis.fetch, changed = () => {}} = {}) {
  let epoch = 0, busy = false;
  let state = {status:'guest', account:null, revision:null, stocks:[], draft:null};
  const view = () => copy(state);
  const emit = () => changed(view());
  function disconnect() {
    epoch++; busy = false;
    state = {status:'guest', account:null, revision:null, stocks:[], draft:null}; emit();
  }
  async function request(method, body, account) {
    return fetcher('/api/v1/watchlist', {
      method, credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{Accept:'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...(account ? {'X-Watchlist-Account':account} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(15000)
    });
  }
  function stocks(value) {
    if (!Array.isArray(value) || value.length > 100) throw Error('Invalid watchlist');
    const seen = new Set();
    return value.map(s => {
      if (!s || typeof s.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(s.symbol) || seen.has(s.symbol) || typeof s.target !== 'number' || !Number.isFinite(s.target) || s.target <= 0 || s.target > 1e9 || s.alertsEnabled !== false) throw Error('Invalid watchlist');
      seen.add(s.symbol); return {symbol:s.symbol,target:s.target,alertsEnabled:false};
    });
  }
  async function snapshot(response) {
    const account = response.headers.get('X-Watchlist-Account');
    const data = await response.json();
    if (!account || account.length > 256 || !Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision >= Number.MAX_SAFE_INTEGER) throw Error('Invalid snapshot');
    return {account,revision:data.revision,stocks:stocks(data.stocks)};
  }
  async function load({discard = false} = {}) {
    if (busy || (state.draft && !discard)) return false;
    const ticket = ++epoch; busy = true;
    // Never leave another account's data visible while resolving the session.
    state = {status:'loading',account:null,revision:null,stocks:[],draft:null}; emit();
    try {
      const response = await request('GET');
      if (ticket !== epoch) return false;
      if (response.status === 401) { disconnect(); return false; }
      if (!response.ok) throw Error('Load failed');
      const data = await snapshot(response);
      if (ticket !== epoch) return false;
      state = {status:'saved',...data,draft:null}; return true;
    } catch {
      if (ticket === epoch) state = {status:'error',account:null,revision:null,stocks:[],draft:null};
      return false;
    } finally { if (ticket === epoch) { busy = false; emit(); } }
  }
  function edit(value) {
    if (busy || !state.account || !['saved','dirty','error'].includes(state.status)) throw Error('Watchlist is not editable');
    const draft = stocks(value);
    state = {...state,status:'dirty',draft}; emit();
  }
  async function save() {
    if (busy || !state.account || !state.draft || !['dirty','error'].includes(state.status)) return false;
    const ticket = epoch, account = state.account, revision = state.revision, draft = copy(state.draft);
    busy = true; state = {...state,status:'saving'}; emit();
    try {
      const response = await request('PUT',{expectedRevision:revision,stocks:draft},account);
      if (ticket !== epoch) return false;
      if (response.status === 401) { state = {...state,status:'expired'}; return false; }
      if (response.status === 409) { state = {...state,status:'conflict'}; return false; }
      if (!response.ok) throw Error('Save failed');
      const data = await snapshot(response);
      if (ticket !== epoch) return false;
      if (data.account !== account || data.revision !== revision + 1) throw Error('Unexpected account or revision');
      state = {status:'saved',...data,draft:null}; return true;
    } catch { if (ticket === epoch) state = {...state,status:'error'}; return false; }
    finally { if (ticket === epoch) { busy = false; emit(); } }
  }
  // A retry is still a compare-and-swap against the original revision and account.
  // If a timed-out save actually committed, retry conflicts instead of overwriting.
  return {view,load,edit,save,retry:save,disconnect};
}
