import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const APP='https://stock-watch-app.lukestaz.workers.dev';
async function fixture(page,signedIn){
 const state={signedIn,logouts:0,blocked:[],errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),now=Date.now(),time=new Date(now-17*60000).toISOString();
  const history=[{t:'2020-01-02T00:00:00Z',c:11,l:10}];
  const reply=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(body)});
  if(u.origin===APP){
   if(u.pathname==='/api/health')return reply({ok:true,mode:'account-preview',database:{bound:true,ready:true}});
   if(u.pathname==='/api/v1/watchlist')return state.signedIn?reply({revision:0,stocks:[{symbol:'LUNR',target:10,alertsEnabled:false}]},200,{'X-Watchlist-Account':'fixture-account'}):reply({error:'Sign in required'},401);
   if(u.pathname==='/api/v1/auth/start')return reply({nonce:'a'.repeat(64)});
   if(u.pathname==='/api/v1/auth/logout'){state.logouts++;state.signedIn=false;return reply({ok:true});}
   if(u.pathname==='/data.json')return reply({updated:new Date(now).toISOString(),status:'Fixture',email:'test-only',whatsapp:'test-only',stocks:[{symbol:'LUNR',target:9,price:11,time,history}]});
   if(u.pathname==='/catalog.json')return reply({assets:[{symbol:'LUNR',name:'Fixture listing',exchange:'TEST'}]});
   if(u.pathname==='/'||/^\/[a-z-]+\.(js|mjs)$/.test(u.pathname))return route.fulfill({status:200,contentType:u.pathname==='/'?'text/html':'text/javascript',body:readFileSync(new URL('../../site/'+(u.pathname==='/'?'index.html':u.pathname.slice(1)),import.meta.url),'utf8')});
  }
  if(u.origin==='https://stock-watch-prices.lukestaz.workers.dev'&&u.pathname==='/v1/stock')return reply({symbol:'LUNR',price:11,time,history,fetchedAt:new Date(now).toISOString(),dataCutoff:new Date(now-16*60000).toISOString()});
  if(u.origin==='https://accounts.google.com'&&u.pathname==='/gsi/client')return route.fulfill({status:200,contentType:'text/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(n){const b=document.createElement("button");b.textContent="Fixture Google sign-in";n.append(b);},disableAutoSelect(){}}}};'});
  state.blocked.push(u.origin+u.pathname);return route.abort('blockedbyclient');
 });
 await page.goto(APP+'/');
 await expect(page.locator('#account-menu-status')).toHaveText(signedIn?'Signed in · cloud watchlist':'Guest · this device');
 return state;
}
test('Refresh stays outside the single menu; guest sign-in opens a separate panel with Escape return',async({page})=>{
 const state=await fixture(page,false),menu=page.locator('.dashboard-nav'),toggle=menu.locator(':scope > summary');
 await expect(page.locator('.nav-actions > #refresh')).toBeVisible();await expect(menu.locator('#refresh')).toHaveCount(0);
 await expect(page.locator('.nav-actions > button')).toHaveCount(1);
 await toggle.focus();await toggle.press('Enter');await expect.poll(()=>menu.evaluate(n=>n.open)).toBe(true);
 await page.locator('#account-menu-entry').click();await expect.poll(()=>menu.evaluate(n=>n.open)).toBe(false);
 const panel=page.locator('#account-panel');await expect(panel).toBeVisible();await expect(menu.locator('#account-panel')).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'Fixture Google sign-in',exact:true})).toBeVisible();
 await panel.press('Escape');await expect(panel).toBeHidden();await expect(toggle).toBeFocused();
 expect(state.logouts).toBe(0);expect(state.blocked).toEqual([]);expect(state.errors).toEqual([]);
});
test('combined account menu preserves unsaved-edit cancellation and confirmed sign-out',async({page})=>{
 const state=await fixture(page,true),menu=page.locator('.dashboard-nav'),toggle=menu.locator(':scope > summary');
 await expect(page.locator('.watchlist-message')).toContainText('Saved to account.');
 const editor=page.locator('.watchlist-tools');await editor.locator(':scope > summary').click();
 const input=editor.locator('[data-watchlist-rows] .watchlist-row input');await expect(input).toHaveValue('10');await input.fill('12.25');
 await toggle.click();await expect(page.locator('#account-menu-entry')).toHaveText('Account');
 page.once('dialog',d=>d.dismiss());await page.locator('#account-menu-logout').click();
 expect(state.logouts).toBe(0);await expect(input).toHaveValue('12.25');await expect(page.locator('#account-menu-status')).toHaveText('Signed in · cloud watchlist');
 page.once('dialog',d=>d.accept());await page.locator('#account-menu-logout').click();
 await expect(page.locator('#account-menu-status')).toHaveText('Guest · this device');expect(state.logouts).toBe(1);
 await expect.poll(()=>menu.evaluate(n=>n.open)).toBe(false);await expect(page.locator('#account-menu-logout')).toBeHidden();
 await expect(page.locator('#account-panel')).toBeVisible();expect(state.blocked).toEqual([]);expect(state.errors).toEqual([]);
});
