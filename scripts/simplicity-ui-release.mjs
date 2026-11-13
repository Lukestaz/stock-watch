import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const UI='9bcea9ce1008847dca71069d48d1b0957c5193e0';
export const RUNTIME='51f4f4400f008a0aa2d913febbfe0ae1a067b654';
export const APP='https://stock-watch-app.lukestaz.workers.dev';
export const ACCOUNT='c4814713eafd41ae857b9a8097610df6';
export const DB='4cb54afc-8f2d-4f62-8b6b-7d59f343b938';
export const REQUEST={uiSha:UI,runtimeSha:RUNTIME,expectedBuild:RUNTIME,confirmation:'DEPLOY stock-watch-app UI9bcea9c RUNTIME51f4f44 ALERTS-OFF NO-MIGRATIONS'};
export function validateRequest(value){assert.deepEqual(value,REQUEST);return value;}
export function validateHealth(h,build){assert.equal(h?.ok,true);assert.equal(h?.mode,'account-preview');assert.equal(h?.build,build);assert.equal(h?.database?.bound,true);assert.equal(h?.database?.ready,true);for(const k of ['verificationReady','enrollmentAvailable','scheduledConfigured'])assert.equal(h?.friendsAlerts?.[k],false);}
const digest=text=>createHash('sha256').update(text).digest('hex');
async function execute(){
 const work=process.env.RELEASE_WORK,output=process.env.REPORT_FILE;
 assert.ok(work&&output&&process.env.CLOUDFLARE_API_TOKEN);mkdirSync(work,{recursive:true});
 const report={schemaVersion:1,sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runNumber:process.env.GITHUB_RUN_NUMBER,runAttempt:process.env.GITHUB_RUN_ATTEMPT,uiSha:UI,runtimeSha:RUNTIME,worker:'stock-watch-app',databaseId:DB,outcome:'running',stage:'preflight',deploymentAttempted:false,deploymentVerified:false,migrationRequested:false,alertsActivated:false,automaticRollbackPerformed:false};
 const save=()=>{report.updatedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
 const cli=args=>execFileSync('npx',['--yes','wrangler@4.150.0',...args,'--config',join(work,'wrangler.jsonc')],{cwd:work,encoding:'utf8',timeout:300000,maxBuffer:8388608,stdio:['ignore','pipe','pipe'],env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CI:'true',WRANGLER_SEND_METRICS:'false'}});
 async function read(url,headers={},redirect='error'){
  const response=await fetch(url,{method:'GET',headers,redirect,signal:AbortSignal.timeout(25000)});
  const reader=response.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
  if(reader)try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000)throw Error('Response limit');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  let json=null;try{json=JSON.parse(text);}catch{}return{status:response.status,text,json,location:response.headers.get('location')};
 }
 const local=(path,headers={},redirect='error')=>read(APP+path,headers,redirect);
 const api=async suffix=>{const r=await read(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/stock-watch-app/${suffix}`,{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`});assert.equal(r.status,200);assert.equal(r.json?.success,true);return r.json.result;};
 try{
  validateRequest(JSON.parse(readFileSync('config/simplicity-ui-release.json','utf8')));
  assert.match(process.env.GITHUB_SHA,/^[a-f0-9]{40}$/);
  for(const [path,sha] of [['application',RUNTIME],['ui',UI]])assert.equal(execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha);
  const before=await local('/api/health');assert.equal(before.status,200);validateHealth(before.json,RUNTIME);report.previousBuild=before.json.build;save();
  const {configuration,validateSchema}=await import(pathToFileURL(resolve('application/scripts/simplicity-production.mjs')).href);
  const settings=await api('settings'),config=configuration(settings);
  assert.equal(settings.bindings.find(b=>b.name==='SIMPLICITY_READ_ONLY')?.text,'true');assert.equal(settings.observability?.logs?.destinations?.length||0,0);
  const schedules=await api('schedules');assert.equal((Array.isArray(schedules)?schedules:schedules.schedules)?.length,0);
  const deployments=await api('deployments'),list=Array.isArray(deployments)?deployments:deployments.deployments;
  assert.ok(Array.isArray(list)&&list.length);const previous=[...list].sort((a,b)=>String(b.created_on).localeCompare(String(a.created_on)))[0];assert.equal(previous.versions?.length,1);assert.equal(previous.versions[0].percentage,100);report.previousDeploymentId=previous.id;report.previousVersionId=previous.versions[0].version_id;
  const secrets=settings.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort();
  cpSync('application/worker/src',join(work,'src'),{recursive:true});cpSync('ui/site',join(work,'static'),{recursive:true});
  const market=join(work,'static/market-data.js'),old='https://stock-watch-prices.lukestaz.workers.dev',text=readFileSync(market,'utf8');assert.ok(text.includes(old));writeFileSync(market,text.split(old).join('/api'));
  config.vars.BUILD_SHA=process.env.GITHUB_SHA;config.vars.UI_BUILD_SHA=UI;config.vars.RUNTIME_BUILD_SHA=RUNTIME;delete config.d1_databases[0].migrations_dir;
  config.observability={enabled:true,head_sampling_rate:1,logs:{enabled:true,invocation_logs:false,persist:true}};
  writeFileSync(join(work,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
  const sql="SELECT name,type,sql FROM sqlite_schema WHERE name IN ('simplicity_fetch_state','simplicity_observations'); PRAGMA table_info(simplicity_fetch_state); PRAGMA table_info(simplicity_observations); PRAGMA foreign_key_list(simplicity_observations); PRAGMA table_info(d1_migrations);";
  const schema=JSON.parse(cli(['d1','execute','DB','--remote','--command',sql,'--json']));assert.ok(Array.isArray(schema)&&schema.every(r=>r.success===true));validateSchema(schema);report.schemaVerified=true;
  const last=await local('/api/health');assert.equal(last.status,200);validateHealth(last.json,RUNTIME);
  report.stage='deploy';report.deploymentAttempted=true;save();cli(['deploy']);
  report.stage='verify';save();let healthy=false;
  for(let i=0;i<6;i++){try{const h=await local('/api/health');assert.equal(h.status,200);validateHealth(h.json,process.env.GITHUB_SHA);healthy=true;break;}catch{}if(i<5)await new Promise(r=>setTimeout(r,5000));}assert.equal(healthy,true);
  const after=await api('settings');configuration(after);assert.equal(after.bindings.find(b=>b.name==='BUILD_SHA')?.text,process.env.GITHUB_SHA);assert.equal(after.bindings.find(b=>b.name==='UI_BUILD_SHA')?.text,UI);assert.equal(after.bindings.find(b=>b.name==='RUNTIME_BUILD_SHA')?.text,RUNTIME);assert.deepEqual(after.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort(),secrets);
  assert.equal(after.observability?.enabled,true);assert.equal(after.observability?.logs?.enabled,true);assert.equal(after.observability?.logs?.invocation_logs,false);assert.notEqual(after.observability?.logs?.persist,false);assert.equal(after.observability?.logs?.destinations?.length||0,0);
  const afterSchedules=await api('schedules');assert.equal((Array.isArray(afterSchedules)?afterSchedules:afterSchedules.schedules)?.length,0);
  let page=await local('/simplicity.html',{},'manual');
  if([301,302,307,308].includes(page.status)){const target=new URL(page.location,APP);assert.equal(target.origin,APP);assert.ok(['/simplicity','/simplicity/'].includes(target.pathname));assert.equal(target.search,'');assert.equal(target.hash,'');page=await local(target.pathname);}
  assert.equal(page.status,200);assert.equal(digest(page.text),digest(readFileSync('ui/site/simplicity.html','utf8')));
  for(const file of ['simplicity.js','simplicity-view.mjs']){const asset=await local('/'+file);assert.equal(asset.status,200);assert.equal(digest(asset.text),digest(readFileSync('ui/site/'+file,'utf8')));}
  const home=await local('/');assert.equal(home.status,200);assert.ok(home.text.includes('href="./simplicity.html"'));report.assetsVerified=true;
  const {validateFundView}=await import(pathToFileURL(resolve('ui/site/simplicity-view.mjs')).href),headers={Origin:APP,'Sec-Fetch-Site':'same-origin'};report.fundChecks=[];
  for(const series of ['simplicity:kiwisaver:high-growth','simplicity:investment:high-growth']){
   const path='/api/v1/fund?series='+encodeURIComponent(series);let first=await local(path,headers);
   if(first.status===503&&first.json?.cache?.reason==='backoff'&&Number.isSafeInteger(first.json?.cache?.retryAt)){await new Promise(r=>setTimeout(r,Math.min(65,Math.max(0,first.json.cache.retryAt-Math.floor(Date.now()/1000))+1)*1000));first=await local(path,headers);}
   assert.equal(first.status,200);validateFundView(first.json,series);assert.equal(first.json.snapshot.identityVerified,false);assert.equal(first.json.snapshot.alertEligible,false);
   const second=await local(path,headers);assert.equal(second.status,200);validateFundView(second.json,series);assert.equal(second.json.cache?.state,'cached');assert.equal(second.json.snapshot.fetchedAt,first.json.snapshot.fetchedAt);report.fundChecks.push({seriesId:series,observationDate:second.json.snapshot.asOfDate,cacheReused:true});
  }
  assert.equal((await local('/api/v1/fund?series=simplicity%3Akiwisaver%3Ahigh-growth',{Origin:'https://example.invalid','Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await local('/api/v1/watchlist',headers)).status,401);
  for(const path of ['/api/v1/alert-destination/email','/api/v1/alert-destination/email/verify','/api/v1/alert-consent/email'])assert.ok([404,503].includes((await local(path,headers)).status));
  report.deploymentVerified=true;report.stage='complete';report.outcome='passed';
 }catch{report.outcome='failed';report.failedStage=report.stage;process.exitCode=1;}finally{save();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await execute();
