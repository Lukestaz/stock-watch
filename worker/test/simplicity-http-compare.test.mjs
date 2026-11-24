import test from 'node:test';
import assert from 'node:assert/strict';
import {curlArgs,curlResponse,compareRequests} from '../../scripts/simplicity-http-compare.mjs';
const fund={seriesId:'simplicity:investment:high-growth',feedUrl:'https://simplicity.kiwi/api/download_prices?fund_name=INVHigh%20Growth'};
const accept='text/csv, text/plain;q=0.9';
test('curl is bounded and does not follow redirects, retry or spoof a browser',()=>{
  const args=curlArgs(fund.feedUrl,'/tmp/test',accept);
  assert.equal(args[0],'--disable');
  for(const flag of ['--max-time','--max-filesize','--proto'])assert.ok(args.includes(flag));
  for(const flag of ['--location','-L','--retry','--user-agent'])assert.equal(args.includes(flag),false);
  assert.ok(args.includes('Accept: '+accept));assert.equal(args.at(-1),fund.feedUrl);
});
test('curl uses the final HTTP header block and preserves status',async()=>{
  const response=curlResponse('HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 404 Not Found\r\nContent-Type: text/html\r\n\r\n',Buffer.from('not found'),404);
  assert.equal(response.status,404);assert.equal(response.headers.get('content-type'),'text/html');assert.equal(await response.text(),'not found');
});
test('curl rejects inconsistent header/status evidence',()=>{
  assert.throws(()=>curlResponse('HTTP/1.1 200 OK\r\n\r\n',Buffer.from('x'),404),/mismatch/);
});
const inspect=async()=>({responseHeaders:{},locationPresent:false});
const fetchHistory=async(f,options)=>{
  assert.equal(f.verificationStatus,'verified');
  const response=await options.fetchImpl(f.feedUrl,{redirect:'manual',signal:AbortSignal.timeout(1000),headers:{Accept:accept}});
  if(!response.ok)throw Error('Feed HTTP '+response.status);
  if(!(await response.text()).startsWith('Date,Price'))throw Error('Unexpected CSV header');
  return {history:[{}],latest:{asOfDate:'2026-11-19'}};
};
test('three probes keep the URL and manual redirects; only second Node probe removes Accept',async()=>{
  const calls=[];
  const transport=kind=>async(url,options)=>{calls.push({kind,url,options});return new Response('Date,Price\n19-11-2026,1.6052');};
  const reports=await compareRequests({fund,fetchHistory,inspect,fetchImpl:transport('node'),curlImpl:transport('curl'),pause:async()=>{}});
  assert.equal(reports.length,3);assert.ok(reports.every(r=>r.parsePassed));
  assert.deepEqual(calls.map(c=>c.kind),['node','node','curl']);
  assert.ok(calls.every(c=>c.url===fund.feedUrl&&c.options.redirect==='manual'&&c.options.signal));
  assert.deepEqual(calls.map(c=>c.options.headers.Accept),[accept,undefined,accept]);
});
test('HTTP failure is retained while remaining comparisons still run',async()=>{
  const reports=await compareRequests({fund,fetchHistory,inspect,fetchImpl:async()=>new Response('not found',{status:404}),curlImpl:async()=>new Response('not found',{status:404}),pause:async()=>{}});
  assert.equal(reports.length,3);assert.ok(reports.every(r=>!r.parsePassed&&r.status===404&&r.error==='Feed HTTP 404'));
});
test('timeout is explicit, not misreported as HTTP 404',async()=>{
  const fail=async()=>{throw new DOMException('timeout','AbortError');};
  const reports=await compareRequests({fund,fetchHistory,inspect,fetchImpl:fail,curlImpl:fail,pause:async()=>{}});
  assert.ok(reports.every(r=>r.error==='Request timed out'&&r.status===undefined&&!r.parsePassed));
});
