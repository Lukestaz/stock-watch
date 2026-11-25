import {test,expect} from '../../tests/dashboard/node_modules/@playwright/test/index.mjs';
import {FUNDS} from './engine.mjs';
const violations=new WeakMap();
test.beforeEach(async({page})=>{
 const errors=[];violations.set(page,errors);page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4174'&&route.request().method()==='GET')return route.continue();errors.push(route.request().method()+' '+u.href);return route.abort();});
 await page.goto('/');
});
test.afterEach(async({page})=>{expect(violations.get(page)).toEqual([]);});
async function demo(page){await page.locator('#demo').click();await page.locator('#ack').check();await page.locator('#run').click();}
test('catalogue and unavailable nowcast',async({page})=>{await expect(page.locator('#fund option')).toHaveCount(FUNDS.length+1);await expect(page.getByText('Unavailable: validated inputs',{exact:false})).toBeVisible();});
test('arithmetic and invalidation',async({page})=>{await demo(page);await expect(page.locator('#result')).toContainText('1.026000');await page.locator('#anchor').fill('2');await expect(page.locator('#result')).toHaveText('Not calculated');await expect(page.locator('#export')).toBeDisabled();});
test('scheme isolation',async({page})=>{await demo(page);await page.locator('#fund').selectOption('simplicity:investment:high-growth');await expect(page.locator('#result')).toHaveText('Not calculated');await expect(page.locator('#anchor')).toHaveValue('');await expect(page.locator('#ack')).not.toBeChecked();await expect(page.getByLabel('Weight percent').first()).toHaveValue('');});
test('missing return rejected',async({page})=>{await demo(page);await page.getByLabel('Period return percent').first().fill('');await page.locator('#run').click();await expect(page.locator('#error')).toContainText('Cumulative return');await expect(page.locator('#result')).toHaveText('Not calculated');});
test('acknowledgement required',async({page})=>{await page.locator('#demo').click();await page.locator('#run').click();await expect(page.locator('#error')).toContainText('Accept hypothetical');});
test('export provenance',async({page})=>{await demo(page);const event=page.waitForEvent('download');await page.locator('#export').click();const d=await event,stream=await d.createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;const value=JSON.parse(raw);expect(value.kind).toBe('forward_scenario');expect(value.fundId).toBe('synthetic-demo');expect(value.nowcastAvailable).toBe(false);expect(value.assumptions.components).toHaveLength(2);});
test('viewport and keyboard',async({page})=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#fund').focus();await page.keyboard.press('Tab');await expect(page.locator('#demo')).toBeFocused();});
