import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatchlistSync} from '../../site/account-sync.mjs';
const stock = (symbol = 'RKLB', target = 10) => ({symbol,target,alertsEnabled:false});
const response = (account = 'account-a', revision = 0, entries = []) => Response.json({revision,stocks:entries},{headers:{'X-Watchlist-Account':account}});

test('sync loads an empty account without importing any guest entries',async () => {
  const calls = [], sync = createWatchlistSync({fetcher:async (...args) => { calls.push(args); return response(); }});
  assert.equal(await sync.load(),true);
  assert.equal(sync.view().status,'saved'); assert.deepEqual(sync.view().stocks,[]);
  assert.equal(calls.length,1); assert.equal(calls[0][1].method,'GET');
});
test('save carries account and expected revision, with alerts disabled',async () => {
  const calls = [], queue = [response('a',4),response('a',5,[stock()])];
  const sync = createWatchlistSync({fetcher:async (...args) => { calls.push(args); return queue.shift(); }});
  await sync.load(); sync.edit([stock()]); assert.equal(await sync.save(),true);
  const options = calls[1][1];
  assert.equal(options.method,'PUT'); assert.equal(options.credentials,'same-origin'); assert.equal(options.redirect,'error');
  assert.equal(options.headers['X-Watchlist-Account'],'a');
  assert.deepEqual(JSON.parse(options.body),{expectedRevision:4,stocks:[stock()]});
  assert.equal(sync.view().revision,5); assert.equal(sync.view().draft,null);
});
test('conflict preserves draft and cannot be silently retried or refreshed',async () => {
  let calls = 0;
  const sync = createWatchlistSync({fetcher:async () => ++calls === 1 ? response() : Response.json({error:'Conflict'},{status:409})});
  await sync.load(); sync.edit([stock()]); assert.equal(await sync.save(),false);
  assert.equal(sync.view().status,'conflict'); assert.deepEqual(sync.view().draft,[stock()]);
  assert.equal(await sync.retry(),false); assert.equal(await sync.load(),false); assert.equal(calls,2);
});
test('network failure keeps draft; retry uses original revision',async () => {
  const calls = []; let count = 0;
  const sync = createWatchlistSync({fetcher:async (path,options) => {
    calls.push(options); if (++count === 1) return response('a',8);
    if (count === 2) throw Error('Offline'); return response('a',9,[stock()]);
  }});
  await sync.load(); sync.edit([stock()]); await sync.save();
  assert.equal(sync.view().status,'error'); assert.deepEqual(sync.view().draft,[stock()]);
  assert.equal(await sync.retry(),true); assert.equal(JSON.parse(calls[2].body).expectedRevision,8);
});
test('logout drops private data and ignores a late load response',async () => {
  let finish;
  const sync = createWatchlistSync({fetcher:() => new Promise(resolve => { finish = resolve; })});
  const pending = sync.load(); sync.disconnect(); finish(response('a',0,[stock()]));
  await pending; assert.deepEqual(sync.view(),{status:'guest',account:null,revision:null,stocks:[],draft:null});
});
test('logout and account switch ignore a late save response',async () => {
  let finish, count = 0;
  const sync = createWatchlistSync({fetcher:async () => {
    count++; if (count === 1) return response('a');
    if (count === 2) return new Promise(resolve => { finish = resolve; });
    return response('b',0,[]);
  }});
  await sync.load(); sync.edit([stock()]); const pending = sync.save(); sync.disconnect();
  await sync.load(); finish(response('a',1,[stock()])); await pending;
  assert.equal(sync.view().account,'b'); assert.deepEqual(sync.view().stocks,[]);
});
test('expired save keeps draft but blocks replay until explicit account reload',async () => {
  let count = 0;
  const sync = createWatchlistSync({fetcher:async () => ++count === 1 ? response() : new Response(null,{status:401})});
  await sync.load(); sync.edit([stock()]); await sync.save();
  assert.equal(sync.view().status,'expired'); assert.deepEqual(sync.view().draft,[stock()]);
  assert.equal(await sync.retry(),false); assert.equal(count,2);
});
test('invalid snapshots, wrong account responses and alert enrollment fail safely',async () => {
  const sync = createWatchlistSync({fetcher:async () => Response.json({revision:0,stocks:[]})});
  assert.equal(await sync.load(),false); assert.equal(sync.view().status,'error');
  const queue = [response('a'),response('b',1,[stock()])];
  const second = createWatchlistSync({fetcher:async () => queue.shift()});
  await second.load(); assert.throws(() => second.edit([{...stock(),alertsEnabled:true}]));
  second.edit([stock()]); assert.equal(await second.save(),false);
  assert.equal(second.view().account,'a'); assert.equal(second.view().status,'error');
});
test('state copies cannot mutate stored snapshots or drafts; parallel saves are blocked',async () => {
  let finish, count = 0;
  const sync = createWatchlistSync({fetcher:async () => ++count === 1 ? response('a',0,[stock()]) : new Promise(resolve => { finish = resolve; })});
  await sync.load(); sync.view().stocks[0].target = 999; assert.equal(sync.view().stocks[0].target,10);
  sync.edit([stock('RKLB',11)]); const pending = sync.save();
  assert.equal(await sync.save(),false); assert.throws(() => sync.edit([]));
  finish(response('a',1,[stock('RKLB',11)])); await pending; assert.equal(count,2);
});
