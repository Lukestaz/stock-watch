import {test,expect} from '@playwright/test';
const KEY='space-stock-watch:v1:watchlist';
const initial={version:1,stocks:[{ticker:'LUNR',target:10},{ticker:'FLY',target:15}]};
const names={LUNR:'Example Lunar Listing Class A',FLY:'Example Flight Listing Common Stock'};
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const row=(page,symbol)=>page.locator('.watchlist-row').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+symbol+'$')})});
async function ready(page){await expect(page.locator('#cards article')).toHaveCount(2);await expect(page.locator('#price-refresh-status')).toContainText('Checked');}
async function refresh(page){const button=page.locator('header #refresh');await expect(button).toHaveText('Refresh');await button.click();}
async function editor(page){const panel=page.locator('.watchlist-tools');if(!await panel.evaluate(n=>n.open))await panel.locator(':scope > summary').click();}
const testState=new WeakMap();
test.beforeEach(async({page,context})=>{
 const state={failPrices:false,blocked:[],errors:[]};testState.set(page,state);
 page.on('pageerror',e=>state.errors.push(e.message));
 await context.addInitScript(({key,value})=>{if(location.origin==='http://127.0.0.1:4173'&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:initial});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const now=Date.now(),time=new Date(now-17*60000).toISOString(),cutoff=new Date(now-16*60000).toISOString();
  const history=Array.from({length:8},(_,i)=>({t:new Date(Date.UTC(2020,0,i+2)).toISOString(),c:20-i,l:19-i}));
  const json=body=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  if(url.origin==='http://127.0.0.1:4173'){
   if(url.pathname==='/data.json')return json({updated:new Date(now).toISOString(),status:'Synthetic test feed',email:'test-only',whatsapp:'test-only',stocks:initial.stocks.map(s=>({symbol:s.ticker,target:s.target,price:s.ticker==='LUNR'?11:17,time,history,status:'Synthetic fixture'}))});
   if(url.pathname==='/catalog.json')return json({assets:Object.entries(names).map(([symbol,name])=>({symbol,name,exchange:'TEST'}))});
   return route.continue();
  }
  if(url.origin==='https://stock-watch-prices.lukestaz.workers.dev'&&url.pathname==='/v1/stock'){
   if(state.failPrices)return route.abort('failed');
   const symbol=url.searchParams.get('symbol');
   return json({symbol,fetchedAt:new Date(now).toISOString(),dataCutoff:cutoff,time,price:symbol==='LUNR'?11:17,history,alertsActive:false});
  }
  state.blocked.push(url.origin+url.pathname);return route.abort('blockedbyclient');
 });
});
test.afterEach(async({page})=>{const state=testState.get(page);expect(state.blocked,'Unexpected external requests were blocked').toEqual([]);expect(state.errors,'Uncaught browser errors').toEqual([]);});
test('saved target and stock order survive reload',async({page})=>{
 await page.goto('/');await ready(page);await editor(page);
 await row(page,'LUNR').locator('input').fill('12.5');await row(page,'LUNR').getByRole('button',{name:'Save LUNR target',exact:true}).click();
 await expect.poll(async()=>(await saved(page)).stocks[0].target).toBe(12.5);
 await row(page,'LUNR').getByRole('button',{name:'LUNR move down',exact:true}).click();
 await expect.poll(async()=>(await saved(page)).stocks.map(s=>s.ticker)).toEqual(['FLY','LUNR']);
 await page.reload();await ready(page);
 await expect(page.locator('.watchlist-row strong')).toHaveText(['FLY','LUNR']);
 await expect(row(page,'LUNR').locator('input')).toHaveValue('12.5');
});
test('unsaved target draft survives data refresh without being saved',async({page})=>{
 await page.goto('/');await ready(page);await editor(page);
 await row(page,'LUNR').locator('input').fill('12.25');
 await refresh(page);await expect(page.locator('#price-refresh-status')).toContainText('Checked');
 await expect(row(page,'LUNR').locator('input')).toHaveValue('12.25');
 await expect(row(page,'LUNR').getByRole('button',{name:'Save LUNR target',exact:true})).toBeEnabled();
 expect(await saved(page)).toEqual(initial);
});
for(const mode of ['Replace','Merge','Cancel'])test('import '+mode+' handles duplicates and preserves expected targets',async({page})=>{
 const incoming={version:1,stocks:[{ticker:'LUNR',target:9}]};
 await page.goto('/#watch='+encodeURIComponent(JSON.stringify(incoming)));await ready(page);
 await page.locator('.watchlist-import').getByRole('button',{name:mode,exact:true}).click();
 const expected=mode==='Replace'?incoming:mode==='Merge'?{version:1,stocks:[{ticker:'LUNR',target:9},{ticker:'FLY',target:15}]}:initial;
 await expect.poll(()=>saved(page)).toEqual(expected);
 await expect(page.locator('.watchlist-import')).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).hash).toBe('');
 await page.reload();await expect.poll(()=>saved(page)).toEqual(expected);
});
for(const [label,ticker,target] of [['invalid ticker','BAD!',5],['negative target','NEW',-1]])test(label+' cannot overwrite saved watchlist',async({page})=>{
 await page.goto('/');await ready(page);await editor(page);
 await page.locator('.editor-add > summary').click();
 const form=page.locator('.watchlist-tools form');
 await form.locator('input:not([type=number])').fill(ticker);await form.locator('input[type=number]').fill(String(target));
 await form.evaluate(n=>n.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await expect(page.locator('.watchlist-message')).toContainText('Invalid');expect(await saved(page)).toEqual(initial);
});
test('failed price refresh retains previously validated quote',async({page})=>{
 await page.goto('/');await ready(page);
 const card=page.locator('#cards article').filter({has:page.getByRole('heading',{name:'LUNR',exact:true})});
 await expect(card.locator('.stock-value')).toHaveText('$11.00');
 testState.get(page).failPrices=true;await refresh(page);
 await expect(page.locator('#price-refresh-status')).toContainText('failed');
 await expect(card.locator('.stock-value')).toHaveText('$11.00');
 await expect(card.locator('.market-data-warning')).toContainText('Retaining older snapshot');
 expect(await saved(page)).toEqual(initial);
});
test('listing names appear under ticker headings',async({page})=>{
 await page.goto('/');await ready(page);
 await expect(page.locator('.stock-listing-name')).toHaveText(Object.values(names));
});
test.fixme('chart zoom and date selection survive data refresh',async()=>{});
