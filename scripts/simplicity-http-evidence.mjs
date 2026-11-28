import {createHash} from 'node:crypto';

export async function inspectFeedResponse(response) {
  const headers = {};
  for (const name of ['server','content-type','content-length','cf-cache-status','retry-after']) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120);
  }
  const evidence = {responseHeaders: headers, redirected: response.redirected, locationPresent: response.headers.has('location')};
  if (response.ok || !response.body) return evidence;
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (bytes < 1024) {
      const {done, value} = await reader.read();
      if (done) break;
      const sample = value.slice(0, 1024 - bytes);
      chunks.push(sample);
      bytes += sample.byteLength;
    }
    const sample = Buffer.concat(chunks), text = sample.toString('utf8').toLowerCase();
    evidence.errorSample = {
      bytes, limitReached: bytes === 1024,
      sha256: createHash('sha256').update(sample).digest('hex'),
      markers: ['not found','access denied','forbidden','cloudflare','captcha','challenge'].filter(marker => text.includes(marker))
    };
  } catch {
    evidence.errorSample = {bytes, readFailed: true};
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return evidence;
}
