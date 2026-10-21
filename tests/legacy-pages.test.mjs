import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSnapshot} from '../legacy-pages/migration.mjs';

test('legacy snapshots retain normalized ticker targets without extra fields', () => {
  assert.deepEqual(normalizeSnapshot({version:1,stocks:[{ticker:' aapl ',target:100,privateNote:'discard'}]}),{version:1,stocks:[{ticker:'AAPL',target:100}]});
});
test('invalid, duplicate, oversized and non-positive snapshots are rejected', () => {
  for (const value of [null,{version:2,stocks:[]},{version:1,stocks:Array(101).fill({ticker:'AAPL',target:1})},
    {version:1,stocks:[{ticker:'A/B',target:1}]},{version:1,stocks:[{ticker:'AAPL',target:0}]},
    {version:1,stocks:[{ticker:'AAPL',target:Infinity}]},{version:1,stocks:[{ticker:'AAPL',target:1},{ticker:'aapl',target:2}]}]) assert.throws(() => normalizeSnapshot(value));
});
test('retirement page links to the app without automatic navigation or data writes', () => {
  const html=readFileSync(new URL('../legacy-pages/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../legacy-pages/migration.mjs',import.meta.url),'utf8');
  assert.ok(html.includes('https://stock-watch-app.lukestaz.workers.dev/'));
  assert.ok(html.includes("connect-src 'none'"));
  assert.doesNotMatch(html,/http-equiv="refresh"/i);
  assert.doesNotMatch(js,/\bfetch\s*\(|localStorage\.(setItem|removeItem|clear)|location\.(assign|replace)\s*\(/);
});
