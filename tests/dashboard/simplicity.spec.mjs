import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const highGrowth = 'simplicity:kiwisaver:high-growth';
const growth = 'simplicity:kiwisaver:growth';
function fund(seriesId = highGrowth, base = 1) {
  const history = [{ asOfDate: '2025-01-01', price: base - 0.1 }, ...Array.from({ length: 40 }, (_, i) => ({ asOfDate: new Date(Date.UTC(2026, 8, 26 + i)).toISOString().slice(0, 10), price: Number((base + i / 100).toFixed(4)) }))];
  const last = history.at(-1);
  return { snapshot: { seriesId, currency: 'NZD', ...last, fetchedAt: '2026-11-07T11:30:00Z', freshness: 'unchecked', identityVerified: false, alertEligible: false }, history, cache: { state: 'fresh' } };
}
test.beforeEach(async ({ page, context }) => {
  page.fundRequests = []; page.blockedRequests = []; page.scriptErrors = [];
  page.feedHandler = () => ({ status: 200, body: fund() });
  page.on('pageerror', error => page.scriptErrors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') {
      page.blockedRequests.push(request.method() + ' ' + url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/v1/fund') {
      page.fundRequests.push(url.searchParams.get('series'));
      const response = await page.feedHandler(url);
      if (response.abort) return route.abort('failed');
      return route.fulfill({ status: response.status, contentType: 'application/json', body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body) });
    }
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (['/simplicity.html', '/simplicity.js', '/simplicity-view.mjs'].includes(url.pathname)) return route.continue();
    page.blockedRequests.push(url.pathname); return route.abort('blockedbyclient');
  });
});
test.afterEach(async ({ page }) => {
  expect(page.blockedRequests).toEqual([]);
  expect(page.scriptErrors).toEqual([]);
});
const loaded = page => expect(page.locator('#status')).toContainText('Published data loaded');

test('successful response renders grouped funds, price, provenance, chart and recent history', async ({ page }) => {
  await page.goto('/simplicity.html'); await loaded(page);
  await expect(page.locator('#fund optgroup[label="KiwiSaver"] option')).toHaveCount(6);
  await expect(page.locator('#fund optgroup[label="Investment"] option')).toHaveCount(4);
  await expect(page.locator('#name')).toHaveText('KiwiSaver - High Growth');
  await expect(page.locator('#price')).toHaveText('NZD 1.3900 per unit');
  await expect(page.locator('#metadata')).toContainText('Observation date: 2026-11-04');
  await expect(page.locator('#metadata')).toContainText('Publication freshness: unchecked');
  await expect(page.locator('#metadata')).toContainText('Identity: unverified; alerts: disabled');
  await expect(page.getByRole('img', { name: 'Published fund unit-price history' })).toBeVisible();
  expect((await page.locator('#line').getAttribute('points')).split(' ')).toHaveLength(40);
  await page.getByText('Price history table', { exact: true }).click();
  await expect(page.locator('#history tr')).toHaveCount(30);
  await expect(page.locator('#history tr').first()).toContainText('2026-11-04');
  await expect(page.locator('#history tr').nth(1)).toContainText('2026-11-03');
});
test('history range redraws locally without another API request', async ({ page }) => {
  await page.goto('/simplicity.html'); await loaded(page);
  await page.getByLabel('History', { exact: true }).selectOption('all');
  await expect(page.locator('#extent')).toContainText('2025-01-01 to 2026-11-04');
  expect((await page.locator('#line').getAttribute('points')).split(' ')).toHaveLength(41);
  await page.getByLabel('History', { exact: true }).selectOption('180');
  expect((await page.locator('#line').getAttribute('points')).split(' ')).toHaveLength(40);
  expect(page.fundRequests).toEqual([highGrowth]);
});
test('503 last-successful data is visibly stale, never labelled current', async ({ page }) => {
  page.feedHandler = () => ({ status: 503, body: { cache: { state: 'stale' }, lastSuccessful: fund() } });
  await page.goto('/simplicity.html');
  await expect(page.locator('#status')).toContainText('explicitly stale last-successful data');
  await expect(page.locator('#metadata')).toContainText('D1 cache: stale');
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#status')).not.toContainText('Published data loaded');
});
test('failed refresh removes the previous price instead of presenting it as current', async ({ page }) => {
  await page.goto('/simplicity.html'); await loaded(page);
  page.feedHandler = () => ({ status: 503, body: { error: 'synthetic unavailable' } });
  await page.getByRole('button', { name: 'Check data' }).click();
  await expect(page.locator('#status')).toContainText('No current price is displayed');
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#price')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Check data' })).toBeEnabled();
});
test('disabled deployment displays the explicit preview-not-enabled message', async ({ page }) => {
  page.feedHandler = () => ({ status: 404, body: { error: 'not enabled' } });
  await page.goto('/simplicity.html');
  await expect(page.locator('#status')).toHaveText('Fund preview is not enabled on this deployment.');
  await expect(page.locator('#result')).toBeHidden();
});
for (const kind of ['wrong series', 'snapshot mismatch', 'invalid JSON']) {
  test('rejects ' + kind + ' without displaying a price', async ({ page }) => {
    page.feedHandler = () => {
      const body = fund();
      if (kind === 'wrong series') body.snapshot.seriesId = growth;
      if (kind === 'snapshot mismatch') body.snapshot.price = 999;
      return { status: 200, body: kind === 'invalid JSON' ? '{invalid' : body };
    };
    await page.goto('/simplicity.html');
    await expect(page.locator('#status')).toContainText('could not be loaded or validated');
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Check data' })).toBeEnabled();
  });
}
test('network failure displays no price and permits retry', async ({ page }) => {
  page.feedHandler = () => ({ abort: true });
  await page.goto('/simplicity.html');
  await expect(page.locator('#status')).toContainText('could not be loaded or validated');
  await expect(page.locator('#result')).toBeHidden();
  page.feedHandler = () => ({ status: 200, body: fund() });
  await page.getByRole('button', { name: 'Check data' }).click(); await loaded(page);
});
test('late first response cannot overwrite a more recent fund selection even if abort is ignored', async ({ page }) => {
  const first = fund();
  await page.addInitScript(({ first, highGrowth }) => {
    const nativeFetch = window.fetch.bind(window);
    let intercepted = false;
    window.fetch = (input, options) => {
      const url = new URL(String(input), location.origin);
      if (!intercepted && url.pathname === '/api/v1/fund' && url.searchParams.get('series') === highGrowth) {
        intercepted = true;
        return new Promise(resolve => { window.releaseFirstFund = () => resolve(new Response(JSON.stringify(first), { status: 200, headers: { 'Content-Type': 'application/json' } })); });
      }
      return nativeFetch(input, options);
    };
  }, { first, highGrowth });
  page.feedHandler = url => ({ status: 200, body: fund(url.searchParams.get('series'), 2) });
  await page.goto('/simplicity.html');
  await page.waitForFunction(() => typeof window.releaseFirstFund === 'function');
  await expect(page.getByRole('button', { name: 'Check data' })).toBeDisabled();
  await page.getByLabel('Fund', { exact: true }).selectOption(growth); await loaded(page);
  await expect(page.locator('#price')).toHaveText('NZD 2.3900 per unit');
  await page.evaluate(async () => { window.releaseFirstFund(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await expect(page.locator('#name')).toHaveText('KiwiSaver - Growth');
  await expect(page.locator('#price')).toHaveText('NZD 2.3900 per unit');
  await expect(page.getByRole('button', { name: 'Check data' })).toBeEnabled();
});
test('controls are labelled and reachable by keyboard, including refresh activation', async ({ page }) => {
  await page.goto('/simplicity.html'); await loaded(page);
  await page.getByRole('link', { name: 'Back to stocks' }).focus();
  await page.keyboard.press('Tab'); await expect(page.getByLabel('Fund', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Check data' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.fundRequests.length).toBe(2); await loaded(page);
  await page.keyboard.press('Tab'); await expect(page.getByLabel('History', { exact: true })).toBeFocused();
});
test('page fits the project viewport with usable touch controls', async ({ page }) => {
  await page.goto('/simplicity.html'); await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const id of ['fund', 'reload', 'range']) {
    const box = await page.locator('#' + id).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('img', { name: 'Published fund unit-price history' })).toBeVisible();
});
