import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function curlArgs(url, dir, accept) {
  return ['--disable','--silent','--show-error','--proto','=https','--connect-timeout','5','--max-time','10','--max-filesize','2000000','--dump-header',join(dir,'headers'),'--output',join(dir,'body'),'--write-out','%{http_code}','--header','Accept: '+accept,'--url',url];
}
export function curlResponse(rawHeaders, body, status) {
  const block = rawHeaders.split(/\r?\n\r?\n/).filter(value => /^HTTP\//.test(value)).at(-1);
  const lines = block?.split(/\r?\n/) || [];
  if (Number(lines.shift()?.split(/\s+/)[1]) !== status) throw Error('curl status/header mismatch');
  const headers = new Headers();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0,colon).trim(),line.slice(colon+1).trim());
  }
  return new Response([204,205,304].includes(status) ? null : body, {status,headers});
}
function curlFetch(url, options) {
  const dir = mkdtempSync(join(tmpdir(),'simplicity-curl-'));
  try {
    const run = spawnSync('curl',curlArgs(url,dir,options.headers.Accept),{encoding:'utf8',timeout:12000,maxBuffer:4096});
    if (run.error || run.status !== 0) throw Error('curl transport failure; exit '+String(run.status));
    return curlResponse(readFileSync(join(dir,'headers'),'utf8'),readFileSync(join(dir,'body')),Number(run.stdout.trim()));
  } finally {rmSync(dir,{recursive:true,force:true});}
}
export async function compareRequests({fund, fetchHistory, inspect, fetchImpl=globalThis.fetch, curlImpl=curlFetch, pause=()=>new Promise(resolve=>setTimeout(resolve,1000))}) {
  const reports = [];
  for (const mode of ['node-existing-accept','node-default-accept','curl-existing-accept']) {
    if (reports.length) await pause();
    const report = {mode,seriesId:fund.seriesId,requestUrl:fund.feedUrl,parsePassed:false};
    try {
      const result = await fetchHistory({...fund,verificationStatus:'verified'},{fetchImpl:async(input,options)=>{
        const actual = mode === 'node-default-accept' ? {...options,headers:{}} : options;
        report.requestAccept = actual.headers.Accept || '(client default)';
        report.redirectMode = actual.redirect;
        const response = await (mode === 'curl-existing-accept' ? curlImpl : fetchImpl)(input,actual);
        report.status = response.status;
        Object.assign(report,await inspect(response));
        return response;
      }});
      report.parsePassed = true;
      report.rows = result.history.length;
      report.asOfDate = result.latest.asOfDate;
    } catch (error) {
      report.error = ['AbortError','TimeoutError'].includes(error?.name) ? 'Request timed out' : String(error?.message || 'Request failed').slice(0,160);
    }
    reports.push(report);
  }
  return reports;
}
async function main() {
  const [{fetchSimplicityHistory},{DOWNLOAD_EVIDENCE},{inspectFeedResponse}] = await Promise.all([
    import('../worker/src/simplicity-fetch.mjs'),import('../worker/src/simplicity-feed-health.mjs'),import('./simplicity-http-evidence.mjs')
  ]);
  const fund = DOWNLOAD_EVIDENCE.find(value=>value.seriesId==='simplicity:investment:high-growth');
  if (!fund) throw Error('Comparison fund unavailable');
  const reports = await compareRequests({fund,fetchHistory:fetchSimplicityHistory,inspect:inspectFeedResponse});
  const output = {schemaVersion:1,scope:'http-comparison-only',sourceSha:process.env.GITHUB_SHA || null,headSha:process.env.HEAD_SHA || null,runId:process.env.GITHUB_RUN_ID || null,runAttempt:process.env.GITHUB_RUN_ATTEMPT || null,nodeVersion:process.version,recordedAt:new Date().toISOString(),limitation:'Sequential probes. curl retains its own user-agent and other transport defaults; a difference does not isolate a single transport property.',reports};
  const text = JSON.stringify(output,null,2)+'\n';
  console.log(text);
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE,text);
  if (reports.some(report=>!report.parsePassed)) process.exitCode=1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
