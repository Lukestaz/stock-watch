import {test,expect} from '@playwright/test';
const KEY='space-stock-watch:v1:watchlist';
const initial={version:1,stocks:[{ticker:'LUNR',target:10}]};
const card=page=>page.locator('#cards article').filter({has:page.getByRole('heading',{name:'LUNR',exact:true})});
const form=page=>card(page).locator('.inline-target-form');
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function open(page){await card(page).getByRole('button',{name:'Edit LUNR target',exact:true}).click();await expect(form(page)).toBeVisible();}

test.beforeEach(async({page,context})=>{
 await context.addInitScript(({key,value})=>{if(location.origin==='http://127.0.0.1:4173'&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:initial});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),now=Date.now(),time=new Date(now-17*60000).toISOString();
  const json=body=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  if(url.origin==='http://127.0.0.1:4173'){
   if(url.pathname==='/data.json')return json({updated:new Date(now).toISOString(),status:'Synthetic fixture',stocks:[{symbol:'LUNR',target:10,price:11,time,history:[],status:'Synthetic fixture'}]});
   if(url.pathname==='/catalog.json')return json({assets:[{symbol:'LUNR',name:'Synthetic Lunar Listing',exchange:'TEST'}]});
   return route.continue();
  }
  if(url.origin==='https://stock-watch-prices.lukestaz.workers.dev'&&url.pathname==='/v1/stock')return json({symbol:'LUNR',price:11,time,fetchedAt:new Date(now).toISOString(),dataCutoff:new Date(now-16*60000).toISOString(),history:[],alertsActive:false});
  return route.abort('blockedbyclient');
 });
 await page.goto('/');await expect(card(page).locator('.inline-target-toggle')).toBeVisible();
});

test('inline Enter saves and survives reload',async({page})=>{
 await open(page);await form(page).locator('input').fill('12.5');await form(page).locator('input').press('Enter');
 await expect.poll(async()=>(await saved(page)).stocks[0].target).toBe(12.5);
 await page.reload();await expect(card(page).locator('.stock-target')).toContainText('$12.50');
});
test('Cancel and Escape do not save',async({page})=>{
 for(const cancel of ['Cancel','Escape']){
  await open(page);await form(page).locator('input').fill('12.5');
  if(cancel==='Cancel')await form(page).getByRole('button',{name:'Cancel',exact:true}).click();else await form(page).locator('input').press('Escape');
  await expect(form(page)).toBeHidden();expect(await saved(page)).toEqual(initial);
 }
});
test('unsaved inline draft survives refresh',async({page})=>{
 await open(page);await form(page).locator('input').fill('12.25');
 await page.locator('header #refresh').click();await expect(page.locator('#price-refresh-status')).toContainText('Checked');
 await expect(form(page)).toBeVisible();await expect(form(page).locator('input')).toHaveValue('12.25');
 expect(await saved(page)).toEqual(initial);
});
test('invalid inline target cannot overwrite saved list',async({page})=>{
 await open(page);await form(page).locator('input').fill('-1');await form(page).getByRole('button',{name:'Save',exact:true}).click();
 await expect(form(page).getByRole('status')).toContainText('Invalid');expect(await saved(page)).toEqual(initial);
});
test('inline and expanded editor share the same draft',async({page})=>{
 await open(page);await form(page).locator('input').fill('12.25');
 await page.locator('.watchlist-tools').evaluate(panel=>panel.open=true);
 await expect(page.locator('.watchlist-row input')).toHaveValue('12.25');
 await page.locator('.watchlist-row input').fill('13.5');await expect(form(page).locator('input')).toHaveValue('13.5');
 await expect(form(page).getByRole('status')).toContainText('Scheduled alerts unchanged.');expect(await saved(page)).toEqual(initial);
});
