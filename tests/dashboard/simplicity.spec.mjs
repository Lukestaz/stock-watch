import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4173',highGrowth='simplicity:kiwisaver:high-growth',growth='simplicity:kiwisaver:growth';
function fund(seriesId=highGrowth,base=1){const history=[{asOfDate:'2025-01-01',price:base-.1},...Array.from({length:40},(_,i)=>({asOfDate:new Date(Date.UTC(2026,8,26+i)).toISOString().slice(0,10),price:Number((base+i/100).toFixed(4))}))];return{snapshot:{seriesId,currency:'NZD',...history.at(-1),fetchedAt:'2026-11-07T11:30:00Z',freshness:'unchecked',identityVerified:false,alertEligible:false},history,cache:{state:'fresh'}};}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const loaded=async page=>{await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#result')).toHaveAttribute('aria-busy','false');};
test.beforeEach(async({page,context})=>{
  page.fundRequests=[];page.blockedRequests=[];page.scriptErrors=[];page.feedHandler=url=>({status:200,body:fund(url.searchParams.get('series'))});
  page.on('pageerror',error=>page.scriptErrors.push(error.message));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin||request.method()!=='GET'){page.blockedRequests.push(request.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient');}
    if(url.pathname==='/api/v1/fund'){page.fundRequests.push(url.searchParams.get('series'));const r=await page.feedHandler(url);return r.abort?route.abort('failed'):route.fulfill({status:r.status,contentType:'application/json',body:typeof r.body==='string'?r.body:JSON.stringify(r.body)});}
    if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    if(['/simplicity.html','/simplicity.js','/simplicity-view.mjs'].includes(url.pathname))return route.continue();page.blockedRequests.push(url.pathname);return route.abort('blockedbyclient');
  });
});
test.afterEach(async({page})=>{expect(page.blockedRequests).toEqual([]);expect(page.scriptErrors).toEqual([]);});
test('price, date, change, chart, recent table and compact provenance',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);await expect(page.locator('#fund option')).toHaveCount(6);
  await expect(page.locator('#name')).toHaveText('KiwiSaver · High Growth');await expect(page.locator('#price')).toHaveText('$1.3900');
  await expect(page.locator('#price-date')).toHaveAttribute('datetime','2026-11-04');await expect(page.locator('#change')).toHaveText('+$0.0100 (+0.72%)');
  await expect(page.locator('#status')).toBeHidden();await expect(page.getByText('Source unverified',{exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Published fund unit-price history'})).toBeVisible();await expect(page.locator('#history tr')).toHaveCount(7);
  await expect(page.locator('#data-details')).not.toHaveAttribute('open','');await page.getByText('Data details',{exact:true}).click();
  for(const text of ['Observation date: 2026-11-04','Publication freshness: unchecked','Identity: unverified; alerts: disabled'])await expect(page.locator('#metadata')).toContainText(text);
});
test('scheme, fund and range persist',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);await page.getByLabel('Scheme',{exact:true}).selectOption('investment');
  await expect(page.locator('#name')).toHaveText('Investment · High Growth');await expect(page.locator('#fund option')).toHaveCount(4);
  await page.getByLabel('Fund',{exact:true}).selectOption('simplicity:investment:growth');await expect(page.locator('#name')).toHaveText('Investment · Growth');
  await button(page,'3M').click();await page.reload();await loaded(page);
  await expect(page.getByLabel('Scheme',{exact:true})).toHaveValue('investment');await expect(page.getByLabel('Fund',{exact:true})).toHaveValue('simplicity:investment:growth');await expect(button(page,'3M')).toHaveAttribute('aria-pressed','true');
});
test('ranges redraw locally and table expands with preceding-observation changes',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);
  for(const [label,count] of [['All',41],['1M',31],['6M',40]]){await button(page,label).click();expect((await page.locator('#line').getAttribute('points')).split(' ')).toHaveLength(count);}
  expect(page.fundRequests).toEqual([highGrowth]);await expect(page.locator('#history tr').first()).toContainText('+0.72%');
  await button(page,'View all (41)').click();await expect(page.locator('#history tr')).toHaveCount(41);await expect(page.locator('#history tr').last()).toContainText('—');
  await button(page,'Show recent').click();await expect(page.locator('#history tr')).toHaveCount(7);
});
test('keyboard and pointer chart inspection',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);const chart=page.locator('#chart');await chart.focus();
  for(const [key,price] of [['Home','$1.0000'],['ArrowRight','$1.0100'],['End','$1.3900']]){await chart.press(key);await expect(page.locator('#chart-readout')).toContainText(price);}
  await chart.click({position:{x:3,y:80}});await expect(page.locator('#chart-readout')).toContainText('$1.0000');
});
for(const code of [200,503])test('stale response HTTP '+code,async({page})=>{
  page.feedHandler=()=>({status:code,body:code===503?{cache:{state:'stale'},lastSuccessful:fund()}:{...fund(),cache:{state:'stale'}}});
  await page.goto('/simplicity.html');await loaded(page);await expect(page.locator('#status')).toContainText('showing stale data');await expect(page.locator('#stale-badge')).toBeVisible();await expect(page.locator('#metadata')).toContainText('D1 cache: stale');
});
test('failed refresh hides previous prices',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);page.feedHandler=()=>({status:503,body:{error:'synthetic'}});await button(page,'Refresh').click();
  await expect(page.locator('#status')).toContainText('Fund prices unavailable');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#price')).toBeHidden();await expect(button(page,'Refresh')).toBeEnabled();
});
test('disabled deployment',async({page})=>{
  page.feedHandler=()=>({status:404,body:{error:'disabled'}});await page.goto('/simplicity.html');await expect(page.locator('#status')).toHaveText('Fund preview is not enabled on this deployment.');await expect(page.locator('#result')).toBeHidden();
});
for(const kind of ['wrong series','snapshot mismatch','invalid JSON','duplicate date','empty history','invalid price'])test('rejects '+kind,async({page})=>{
  page.feedHandler=()=>{const body=fund();if(kind==='wrong series')body.snapshot.seriesId=growth;if(kind==='snapshot mismatch')body.snapshot.price=999;if(kind==='duplicate date')body.history.push(body.history[0]);if(kind==='empty history')body.history=[];if(kind==='invalid price')body.snapshot.price=-1;return{status:200,body:kind==='invalid JSON'?'{invalid':body};};
  await page.goto('/simplicity.html');await expect(page.locator('#status')).toContainText('could not be loaded or validated');await expect(page.locator('#result')).toBeHidden();await expect(button(page,'Refresh')).toBeEnabled();
});
test('network failure permits retry',async({page})=>{
  page.feedHandler=()=>({abort:true});await page.goto('/simplicity.html');await expect(page.locator('#status')).toContainText('could not be loaded or validated');await expect(page.locator('#result')).toBeHidden();page.feedHandler=()=>({status:200,body:fund()});await button(page,'Refresh').click();await loaded(page);
});
test('late response cannot replace the selected fund even if abort is ignored',async({page})=>{
  await page.addInitScript(({first,highGrowth})=>{const original=window.fetch.bind(window);let intercepted=false;window.fetch=(input,options)=>{const url=new URL(String(input),location.origin);if(!intercepted&&url.pathname==='/api/v1/fund'&&url.searchParams.get('series')===highGrowth){intercepted=true;return new Promise(resolve=>{window.releaseFirstFund=()=>resolve(new Response(JSON.stringify(first),{status:200,headers:{'Content-Type':'application/json'}}));});}return original(input,options);};},{first:fund(),highGrowth});
  page.feedHandler=url=>({status:200,body:fund(url.searchParams.get('series'),2)});await page.goto('/simplicity.html');await page.waitForFunction(()=>typeof window.releaseFirstFund==='function');await expect(button(page,'Refresh')).toBeDisabled();
  await page.getByLabel('Fund',{exact:true}).selectOption(growth);await loaded(page);await expect(page.locator('#price')).toHaveText('$2.3900');
  await page.evaluate(async()=>{window.releaseFirstFund();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await expect(page.locator('#name')).toHaveText('KiwiSaver · Growth');await expect(page.locator('#price')).toHaveText('$2.3900');await expect(button(page,'Refresh')).toBeEnabled();
});
test('keyboard controls and mobile viewport',async({page})=>{
  await page.goto('/simplicity.html');await loaded(page);await page.getByRole('link',{name:'Back to stocks'}).focus();
  for(const control of [page.getByLabel('Scheme',{exact:true}),page.getByLabel('Fund',{exact:true}),button(page,'Refresh')]){await page.keyboard.press('Tab');await expect(control).toBeFocused();}
  await page.keyboard.press('Enter');await expect.poll(()=>page.fundRequests.length).toBe(2);await loaded(page);await page.keyboard.press('Tab');await expect(button(page,'1M')).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const selector of ['#scheme','#fund','#reload','[data-range="30"]','#history-toggle'])expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
});
for(const single of [false,true])test(single?'single observation':'flat series',async({page})=>{
  page.feedHandler=()=>{const body=fund();body.history=body.history.slice(single?-1:-4).map(r=>({...r,price:1}));Object.assign(body.snapshot,body.history.at(-1));return{status:200,body};};
  await page.goto('/simplicity.html');await loaded(page);const points=(await page.locator('#line').getAttribute('points')).split(' ').map(p=>p.split(',').map(Number));expect(points.every(([x,y])=>Number.isFinite(x)&&Math.abs(y-120)<.01)).toBe(true);
  if(single){expect(points).toEqual([[400,120]]);await expect(page.locator('#change')).toHaveText('—');await expect(page.locator('#history-toggle')).toBeHidden();}else await expect(page.locator('#change')).toHaveText('$0.0000 (0.00%)');
});
test('invalid saved preferences use supported defaults',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('stock-watch:simplicity-ui:v1',JSON.stringify({scheme:'unsupported',fund:'not-a-series',range:'bad'})));await page.goto('/simplicity.html');await loaded(page);await expect(page.getByLabel('Scheme',{exact:true})).toHaveValue('kiwisaver');await expect(page.getByLabel('Fund',{exact:true})).toHaveValue(highGrowth);await expect(button(page,'6M')).toHaveAttribute('aria-pressed','true');
});
