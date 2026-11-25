import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {createAccountWorker} from '../src/account-runtime.mjs';
const origin = 'https://stock-watch-app.lukestaz.workers.dev';
const fundRequest = () => new Request(origin + '/api/v1/fund?series=fixture');
const friendsOn = {ACCOUNTS_ENABLED: 'true', FRIENDS_ALERTS_ENABLED: 'true', FRIENDS_SCHEDULE_ENABLED: 'true'};

test('the fund route is served first and never composes the app or loads friends code, flags on or off', async () => {
  for (const env of [{}, friendsOn]) {
    let loads = 0, composed = 0;
    const app = createAccountWorker({
      compose: () => {composed++; return {fetch: async () => new Response('app')};},
      friendsLoader: async () => {loads++; throw Error('Unexpected friends load');},
      fund: async () => new Response('fund')
    });
    const response = await app.fetch(fundRequest(), env, {});
    assert.equal(await response.text(), 'fund');
    assert.equal(loads, 0);
    assert.equal(composed, 0);
  }
});

test('with friends flags off, friends routes are unavailable, the app and fund route are unaffected, and nothing loads', async () => {
  let loads = 0;
  const app = createAccountWorker({
    compose: () => ({fetch: async () => new Response('app')}),
    friendsLoader: async () => {loads++; throw Error('Unexpected friends load');},
    fund: async () => new Response('fund')
  });
  for (const path of ['/api/v1/alert-destination/email', '/api/v1/alert-destination/email/verify', '/api/v1/alert-consent/email']) {
    const response = await app.fetch(new Request(origin + path), {}, {});
    assert.equal(response.status, 503);
  }
  assert.equal(await (await app.fetch(new Request(origin + '/'), {}, {})).text(), 'app');
  assert.equal(await (await app.fetch(fundRequest(), {}, {})).text(), 'fund');
  assert.equal((await app.scheduled({}, {}, {})).status, 'disabled');
  assert.equal(loads, 0);
});

test('flagged friends runtime coexists with the fund route and extends only the health response', async () => {
  let loads = 0;
  const app = createAccountWorker({
    compose: () => ({fetch: async () => Response.json({ok: true, mode: 'account-preview'})}),
    friendsLoader: async () => {
      loads++;
      return {createFriendsRuntime: async () => ({ready: true, enrollmentEnabled: false, scheduledConfigured: false,
        fetch: async () => new Response('friends-api'), scheduled: async () => ({status: 'ok'})})};
    },
    fund: async () => new Response('fund')
  });
  const env = {ACCOUNTS_ENABLED: 'true', FRIENDS_ALERTS_ENABLED: 'true'};
  assert.equal(await (await app.fetch(fundRequest(), env, {})).text(), 'fund');
  assert.equal(loads, 0);
  assert.equal(await (await app.fetch(new Request(origin + '/api/v1/alert-consent/email'), env, {})).text(), 'friends-api');
  const health = await (await app.fetch(new Request(origin + '/api/health'), env, {})).json();
  assert.equal(health.mode, 'account-preview');
  assert.deepEqual(health.friendsAlerts, {verificationReady: true, enrollmentAvailable: false, scheduledConfigured: false});
  assert.equal(loads, 1);
});

test('the default runtime keeps the fund route behind its own read-only flag and the schedule disabled', async () => {
  const response = await worker.fetch(fundRequest(), {}, {});
  assert.equal(response.status, 404);
  assert.equal((await worker.scheduled({}, {}, {})).status, 'disabled');
});
