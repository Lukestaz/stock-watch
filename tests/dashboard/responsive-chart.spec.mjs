import {test,expect} from '@playwright/test';
test('chart typography and pointer geometry respond to desktop/mobile resizing',async({page,context})=>{
 const errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url()),now=Date.now(),time=new Date(now-17*60000).toISOString();
  const history=Array.from({length:8},(_,i)=>({t:new Date(Date.UTC(2020,0,i+2)).toISOString(),c:20-i,l:19-i}));
  const json=body=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  if(u.origin==='http://127.0.0.1:4173'){
   if(u.pathname==='/data.json')return json({updated:time,status:'Synthetic',email:'test-only',whatsapp:'test-only',stocks:[{symbol:'LUNR',target:10,price:11,time,history}]});
   if(u.pathname==='/catalog.json')return json({assets:[{symbol:'LUNR',name:'Synthetic Listing',exchange:'TEST'}]});
   return route.continue();
  }
  if(u.origin==='https://stock-watch-prices.lukestaz.workers.dev'&&u.pathname==='/v1/stock')return json({symbol:'LUNR',price:11,time,fetchedAt:new Date(now).toISOString(),dataCutoff:new Date(now-16*60000).toISOString(),history,alertsActive:false});
  blocked.push(u.origin);return route.abort('blockedbyclient');
 });
 await page.setViewportSize({width:1280,height:900});await page.goto('/');
 const svg=page.locator('svg.chart');await expect(svg.locator('.chart-axis-label').first()).toBeVisible();
 const pixels=()=>svg.locator('.chart-axis-label').first().evaluate(n=>Number(n.getAttribute('font-size'))*n.getScreenCTM().a);
 await expect.poll(pixels).toBeGreaterThan(12);await expect.poll(pixels).toBeLessThanOrEqual(13.2);
 const inspectQuarter=async()=>{const box=await svg.locator('.chart-hit-area').boundingBox();await page.mouse.click(box.x+box.width*.25,box.y+box.height*.5);await expect(page.locator('.readout')).toContainText('4 Jan 2020');};
 await inspectQuarter();
 const unclipped=()=>svg.locator('text').evaluateAll(nodes=>nodes.every(n=>{const b=n.getBBox();return b.x>=-.5&&b.x+b.width<=900.5&&b.y>=-.5&&b.y+b.height<=480.5;}));
 expect(await unclipped()).toBe(true);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>svg.locator('.chart-axis-label').first().getAttribute('font-size')).toBe('25');
 await expect(page.locator('.readout')).toContainText('4 Jan 2020');await inspectQuarter();expect(await unclipped()).toBe(true);
 await page.setViewportSize({width:1280,height:900});await expect.poll(pixels).toBeLessThanOrEqual(13.2);await inspectQuarter();
 expect(blocked).toEqual([]);expect(errors).toEqual([]);
});
