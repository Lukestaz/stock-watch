import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectFeedResponse} from '../../scripts/simplicity-http-evidence.mjs';

test('successful CSV body is not consumed', async () => {
  const response = new Response('Date,Price\n19-11-2026,1.6052');
  const result = await inspectFeedResponse(response);
  assert.equal(response.bodyUsed, false);
  assert.equal(result.errorSample, undefined);
  assert.match(await response.text(), /Date,Price/);
});
test('404 records a fingerprint and fixed markers, not raw HTML or cookies', async () => {
  const response = new Response('<html>Not found. Cloudflare. secret-token</html>', {status:404, headers:{server:'test-edge','set-cookie':'private-cookie'}});
  const result = await inspectFeedResponse(response), encoded = JSON.stringify(result);
  assert.equal(response.status, 404);
  assert.deepEqual(result.errorSample.markers, ['not found','cloudflare']);
  assert.match(result.errorSample.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.responseHeaders.server, 'test-edge');
  for (const value of ['secret-token','private-cookie','<html>']) assert.equal(encoded.includes(value), false);
});
test('error sample is limited to 1024 bytes and cancels the remaining stream', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8192).fill(65));},cancel(){cancelled=true;}}), {status:404});
  const result = await inspectFeedResponse(response);
  assert.equal(result.errorSample.bytes, 1024);
  assert.equal(result.errorSample.limitReached, true);
  assert.equal(cancelled, true);
});
test('failed sample reads do not change the HTTP failure or throw', async () => {
  const response = new Response(new ReadableStream({start(c){c.error(new Error('private detail'));}}), {status:404});
  const result = await inspectFeedResponse(response);
  assert.equal(result.errorSample.readFailed, true);
  assert.equal(response.status, 404);
  assert.equal(JSON.stringify(result).includes('private detail'), false);
});
test('redirect destinations are not disclosed or followed by evidence collection', async () => {
  const response = new Response(null, {status:302, headers:{location:'https://example.invalid/?token=private'}});
  const result = await inspectFeedResponse(response);
  assert.equal(result.locationPresent, true);
  assert.equal(JSON.stringify(result).includes('token'), false);
});
test('diagnostics retain all ten feeds, native request options and strict failure exit', () => {
  const source = readFileSync(new URL('../../scripts/simplicity-diagnostics.mjs', import.meta.url), 'utf8');
  assert.match(source, /for \(const fund of DOWNLOAD_EVIDENCE\)/);
  assert.match(source, /fetch\(input, options\)/);
  assert.match(source, /await inspectFeedResponse\(response\)/);
  assert.match(source, /if \(!response.body \|\| !response.ok\) return response/);
  assert.match(source, /process.exitCode = 1/);
});
