import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const APP='https://stock-watch-app.lukestaz.workers.dev';
const KEY='space-stock-watch:v1:watchlist';
const guest={version:1,stocks:[{ticker:'FLY',target:7}]};
const card=(page,symbol='LUNR')=>page.locator('#cards article').filter({has:page.getByRole('heading',{name:symbol,exact:true})});
const editor=page=>card(page).locator('.inline-target-form');
const draft=page=>page.locator('.watchlist-row').filter({has:page.locator('strong').filter({hasText:/^LUNR$/})}).locator('input');
async function edit(page){await card(page).getByRole('button',{name:'Edit LUNR target',exact:true}).click();await editor(page).locator('input').fill('12.25');}
async function fixture(page){
 const state={signedIn:true,account:'fixture-A',revision:0,stocks:[{symbol:'LUNR',target:10,alertsEnabled:false}],putStatus:200,puts:[],hold:false,release:null,errors:[],blocked:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.addInitScript(({key,value})=>{if(location.origin==='https://stock-watch-app.lukestaz.workers.dev'&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:guest});
 await page.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url()),now=Date.now(),time=new Date(now-17*60000).toISOString();
  const history=[{t:'2020-01-02T00:00:00Z',c:11,l:10}];
  const reply=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(body)});
  if(u.origin===APP){
   if(u.pathname==='/api/health')return reply({ok:true,mode:'account-preview',database:{bound:true,ready:true}});
   if(u.pathname==='/api/v1/watchlist'){
    if(!state.signedIn)return reply({error:'Sign in required'},401);
    if(request.method()==='PUT'){
     const body=request.postDataJSON();state.puts.push({body,account:request.headers()['x-watchlist-account']});
     if(state.hold)await new Promise(resolve=>{state.release=resolve;});
     if(state.putStatus!==200)return reply({error:'Synthetic save rejection'},state.putStatus);
     if(body.expectedRevision!==state.revision)return reply({error:'Conflict'},409);
     state.stocks=body.stocks;state.revision++;
    }
    return reply({revision:state.revision,stocks:state.stocks},200,{'X-Watchlist-Account':state.account});
   }
   if(u.pathname==='/api/v1/auth/start')return reply({nonce:'a'.repeat(64)});
   if(u.pathname==='/api/v1/auth/logout'){state.signedIn=false;return reply({ok:true});}
   if(u.pathname==='/data.json')return reply({updated:new Date(now).toISOString(),status:'Synthetic fixture',email:'test-only',whatsapp:'test-only',stocks:[{symbol:'LUNR',target:9,price:11,time,history},{symbol:'FLY',target:7,price:17,time,history}]});
   if(u.pathname==='/catalog.json')return reply({assets:[{symbol:'LUNR',name:'Synthetic Lunar Listing',exchange:'TEST'},{symbol:'FLY',name:'Synthetic Flight Listing',exchange:'TEST'}]});
   if(u.pathname==='/'||/^\/[a-z-]+\.(js|mjs)$/.test(u.pathname))return route.fulfill({status:200,contentType:u.pathname==='/'?'text/html':'text/javascript',body:readFileSync(new URL('../../site/'+(u.pathname==='/'?'index.html':u.pathname.slice(1)),import.meta.url),'utf8')});
  }
  if(u.origin==='https://stock-watch-prices.lukestaz.workers.dev'&&u.pathname==='/v1/stock')return reply({symbol:u.searchParams.get('symbol'),price:11,time,history,fetchedAt:new Date(now).toISOString(),dataCutoff:new Date(now-16*60000).toISOString()});
  if(u.origin==='https://accounts.google.com'&&u.pathname==='/gsi/client')return route.fulfill({status:200,contentType:'text/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}};'});
  state.blocked.push(u.origin+u.pathname);return route.abort('blockedbyclient');
 });
 await page.goto(APP+'/');await expect(page.locator('.watchlist-message')).toContainText('Saved to account.');
 await expect(card(page).locator('.inline-target-toggle')).toBeVisible();
 return state;
}
const states=new WeakMap();
test.beforeEach(async({page})=>states.set(page,await fixture(page)));
test.afterEach(async({page})=>{const state=states.get(page);if(!state)return;if(state.release)state.release();expect(state.blocked).toEqual([]);expect(state.errors).toEqual([]);});

test('inline account save locks during PUT and persists without touching guest list',async({page})=>{
 const state=states.get(page);state.hold=true;await edit(page);await editor(page).locator('input').press('Enter');
 await expect.poll(()=>state.puts.length).toBe(1);await expect(page.locator('.watchlist-message')).toContainText('Saving to account');
 await expect(card(page).locator('.inline-target-toggle')).toBeDisabled();
 expect(state.puts[0]).toEqual({account:'fixture-A',body:{expectedRevision:0,stocks:[{symbol:'LUNR',target:12.25,alertsEnabled:false}]}});
 await expect.poll(()=>typeof state.release).toBe('function');state.hold=false;state.release();state.release=null;
 await expect(page.locator('.watchlist-message')).toContainText('Saved to account.');await page.reload();
 await expect(card(page).locator('.stock-target')).toContainText('$12.25');expect(state.puts).toHaveLength(1);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY)).toEqual(guest);
});
for(const [status,label] of [[409,'Account or watchlist changed'],[401,'Session expired']])test('inline '+status+' preserves draft and prevents another write',async({page})=>{
 const state=states.get(page);state.putStatus=status;await edit(page);await editor(page).getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.locator('.watchlist-message')).toContainText(label);await expect(draft(page)).toHaveValue('12.25');
 await expect(card(page).locator('.inline-target-toggle')).toBeDisabled();expect(state.puts).toHaveLength(1);expect(state.stocks[0].target).toBe(10);
});
test('failed inline save retries original account revision without losing draft',async({page})=>{
 const state=states.get(page);state.putStatus=503;await edit(page);await editor(page).getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.locator('.watchlist-message')).toContainText('Not saved. Draft kept');await expect(draft(page)).toHaveValue('12.25');
 await page.locator('.watchlist-tools').evaluate(panel=>panel.open=true);state.putStatus=200;
 await page.getByRole('button',{name:'Retry save',exact:true}).click();await expect(page.locator('.watchlist-message')).toContainText('Saved to account.');
 expect(state.puts).toHaveLength(2);expect(state.puts[1]).toEqual(state.puts[0]);expect(state.stocks[0].target).toBe(12.25);
});
test('sign-out cancellation keeps inline draft; confirmed sign-out clears private cards',async({page})=>{
 const state=states.get(page);await edit(page);await page.locator('.dashboard-nav > summary').click();
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#account-menu-logout').click();
 await expect(editor(page).locator('input')).toHaveValue('12.25');expect(state.signedIn).toBe(true);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#account-menu-logout').click();
 await expect(page.locator('#account-menu-status')).toHaveText('Guest · this device');await expect(card(page)).toHaveCount(0);
 await expect(card(page,'FLY').locator('.stock-target')).toContainText('$7.00');expect(state.puts).toHaveLength(0);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY)).toEqual(guest);
});
test('forced account transition discards previous inline draft and private cards',async({page})=>{
 const state=states.get(page);await edit(page);
 await page.evaluate(async()=>{const {accountSession}=await import('/account-session.mjs');accountSession.set('checking');});
 await expect(page.locator('#cards article')).toHaveCount(0);
 state.account='fixture-B';state.revision=0;state.stocks=[{symbol:'FLY',target:20,alertsEnabled:false}];
 await page.evaluate(async()=>{const {accountSession}=await import('/account-session.mjs');accountSession.set('signed-in');});
 await expect(card(page,'FLY').locator('.stock-target')).toContainText('$20.00');await expect(card(page)).toHaveCount(0);
 expect(state.puts).toHaveLength(0);await expect(page.locator('.watchlist-row input')).toHaveValue('20');
});
