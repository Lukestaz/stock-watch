import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const RELEASE = '40986bd5e34c7e38bd349607446130699d9e8c25';
export const ACCOUNT = 'c4814713eafd41ae857b9a8097610df6';
export const DB = '4cb54afc-8f2d-4f62-8b6b-7d59f343b938';
export const APP = 'https://stock-watch-app.lukestaz.workers.dev';
const MIGRATION = '0005_simplicity.sql';
const flags = ['FRIENDS_ALERTS_ENABLED','FRIENDS_ENROLLMENT_ENABLED','FRIENDS_SCHEDULE_ENABLED'];
export function configuration(settings) {
  assert.ok(Array.isArray(settings.bindings));
  const vars = {}, databases = [], services = [], ratelimits = [];
  for (const b of settings.bindings) {
    if (b.type === 'plain_text') { assert.equal(typeof b.text, 'string'); vars[b.name] = b.text; }
    else if (b.type === 'secret_text' || b.type === 'assets') continue;
    else if (b.type === 'd1') { assert.equal(b.name,'DB'); assert.equal(b.id,DB); databases.push({binding:'DB',database_name:'stock-watch',database_id:DB,migrations_dir:'migrations'}); }
    else if (b.type === 'service') { assert.equal(b.name,'PRICES'); assert.equal(b.service,'stock-watch-prices'); assert.ok(!b.environment || b.environment==='production'); services.push({binding:b.name,service:b.service,...(b.environment?{environment:b.environment}:{})}); }
    else if (b.type === 'ratelimit') { assert.equal(b.name,'ACCOUNT_LIMIT'); assert.equal(String(b.namespace_id),'1986667311'); assert.deepEqual(b.simple,{limit:30,period:60}); ratelimits.push({name:b.name,namespace_id:String(b.namespace_id),simple:b.simple}); }
    else throw Error('Unsupported existing binding');
  }
  assert.equal(databases.length,1); assert.equal(services.length,1); assert.equal(ratelimits.length,1);
  assert.equal(vars.ACCOUNTS_ENABLED,'true'); assert.equal(vars.APP_ORIGIN,APP);
  assert.ok(typeof vars.GOOGLE_CLIENT_ID==='string' && vars.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com'));
  for (const name of flags) assert.ok(vars[name]===undefined || vars[name]==='false');
  assert.match(settings.compatibility_date||'',/^\d{4}-\d{2}-\d{2}$/);
  Object.assign(vars,{BUILD_SHA:RELEASE,SIMPLICITY_READ_ONLY:'true'});
  for (const name of flags) vars[name]='false';
  return {name:'stock-watch-app',main:'src/account-runtime.mjs',compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags||[],workers_dev:true,preview_urls:false,d1_databases:databases,vars,ratelimits,assets:{directory:'./static',binding:'ASSETS',run_worker_first:true},services,triggers:{crons:[]}};
}
export function validateSchema(reports, allowMissing=false) {
  assert.equal(reports.length,5);
  const objects=reports[0].results;
  const state=['series_id','fetched_at','checked_at','fresh_until','retry_at','failures','lease_owner','lease_until'];
  for (const [name,index,columns,types,pks] of [
    ['simplicity_fetch_state',1,state,['TEXT','TEXT','INTEGER','INTEGER','INTEGER','INTEGER','TEXT','INTEGER'],[1,0,0,0,0,0,0,0]],
    ['simplicity_observations',2,['series_id','as_of_date','price'],['TEXT','TEXT','REAL'],[1,2,0]]
  ]) {
    const object=objects.find(o=>o.name===name), actual=reports[index].results;
    if (!object && allowMissing) { assert.equal(actual.length,0); continue; }
    assert.equal(object?.type,'table');
    assert.deepEqual(actual.map(c=>c.name),columns); assert.deepEqual(actual.map(c=>c.type.toUpperCase()),types); assert.deepEqual(actual.map(c=>c.pk),pks);
    if (index===2) { assert.ok(actual.every(c=>c.notnull===1)); assert.match(object.sql,/CHECK\s*\(\s*price\s*>\s*0\s*\)/i); }
  }
  if (objects.some(o=>o.name==='simplicity_observations')) {
    assert.ok(reports[3].results.some(f=>f.table==='simplicity_fetch_state'&&f.from==='series_id'&&f.to==='series_id'));
  }
  assert.ok(reports[4].results.some(c=>c.name==='name'));
}
const schemaSQL = "SELECT name,type,sql FROM sqlite_schema WHERE name IN ('simplicity_fetch_state','simplicity_observations'); PRAGMA table_info(simplicity_fetch_state); PRAGMA table_info(simplicity_observations); PRAGMA foreign_key_list(simplicity_observations); PRAGMA table_info(d1_migrations);";
async function execute() {
  const source=resolve(process.env.RELEASE_DIR||''), work=resolve(process.env.RELEASE_WORK||''), output=process.env.OUTCOME_FILE;
  assert.ok(process.env.RELEASE_DIR&&process.env.RELEASE_WORK&&output);
  mkdirSync(work,{recursive:true});
  const report={schemaVersion:1,releaseSha:RELEASE,sourceSha:process.env.GITHUB_SHA,sourceRef:process.env.GITHUB_REF,runId:process.env.GITHUB_RUN_ID,runNumber:process.env.GITHUB_RUN_NUMBER,runAttempt:process.env.GITHUB_RUN_ATTEMPT,worker:'stock-watch-app',databaseId:DB,appUrl:APP,stage:'initialise',outcome:'running',migrationAttempted:false,migrationVerified:false,deploymentAttempted:false,deploymentVerified:false,automaticRollbackPerformed:false};
  const save=()=>{report.updatedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
  const stage=name=>{report.stage=name;save();};
  const token=process.env.CLOUDFLARE_API_TOKEN;
  const api=async suffix=>{
    assert.ok(token);
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/stock-watch-app/${suffix}`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});
    assert.equal(r.ok,true); const data=await r.json(); assert.equal(data.success,true); return data.result;
  };
  const get=(path,headers={})=>fetch(APP+path,{headers,redirect:'error',signal:AbortSignal.timeout(25000)});
  const configPath=join(work,'wrangler.jsonc');
  const cli=(args,timeout=180000)=>{
    const r=spawnSync('npx',['--yes','wrangler@4.150.0',...args,'--config',configPath],{cwd:work,encoding:'utf8',timeout,maxBuffer:8388608,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CI:'true',WRANGLER_SEND_METRICS:'false'}});
    assert.equal(r.status,0,'Provider command failed; raw output suppressed'); return r.stdout;
  };
  const sql=command=>{
    const data=JSON.parse(cli(['d1','execute','DB','--remote','--command',command,'--json']));
    assert.ok(Array.isArray(data)&&data.length&&data.every(r=>r.success===true&&Array.isArray(r.results))); return data;
  };
  try {
    stage('preflight');
    const head=spawnSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}); assert.equal(head.status,0); assert.equal(head.stdout.trim(),RELEASE);
    const healthResponse=await get('/api/health'), health=await healthResponse.json();
    assert.equal(healthResponse.ok,true); assert.equal(health.ok,true); assert.equal(health.mode,'account-preview'); assert.equal(health.database?.bound,true); assert.equal(health.database?.ready,true); assert.match(health.build||'',/^[a-f0-9]{40}$/);
    assert.ok(!health.friendsAlerts?.verificationReady&&!health.friendsAlerts?.enrollmentAvailable&&!health.friendsAlerts?.scheduledConfigured);
    report.previousBuild=health.build;
    const deployments=await api('deployments');
    const list=Array.isArray(deployments)?deployments:deployments.deployments;
    assert.ok(Array.isArray(list)&&list.length);
    const previous=[...list].sort((a,b)=>String(b.created_on).localeCompare(String(a.created_on)))[0];
    assert.equal(previous.versions?.length,1); assert.equal(previous.versions[0].percentage,100);
    report.previousDeploymentId=previous.id; report.previousVersionId=previous.versions[0].version_id; save();
    const schedules=await api('schedules'); assert.equal((Array.isArray(schedules)?schedules:schedules.schedules)?.length,0);
    const settings=await api('settings'), config=configuration(settings);
    const secrets=settings.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort();
    writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
    cpSync(join(source,'worker/src'),join(work,'src'),{recursive:true}); cpSync(join(source,'site'),join(work,'static'),{recursive:true});
    const market=join(work,'static/market-data.js'), old='https://stock-watch-prices.lukestaz.workers.dev', text=readFileSync(market,'utf8'); assert.ok(text.includes(old)); writeFileSync(market,text.split(old).join('/api'));
    mkdirSync(join(work,'migrations')); cpSync(join(source,'worker/migrations',MIGRATION),join(work,'migrations',MIGRATION));
    const ddl=readFileSync(join(work,'migrations',MIGRATION),'utf8'); assert.ok(!/\b(DROP|ALTER|DELETE|UPDATE|INSERT|REPLACE)\b/i.test(ddl)); assert.equal((ddl.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,2);
    validateSchema(sql(schemaSQL),true);
    const before=sql('SELECT name FROM d1_migrations ORDER BY name;')[0].results.map(r=>r.name);
    stage('migration');
    if (!before.includes(MIGRATION)) { report.migrationAttempted=true; save(); cli(['d1','migrations','apply','DB','--remote']); }
    validateSchema(sql(schemaSQL));
    const after=sql('SELECT name FROM d1_migrations ORDER BY name;')[0].results.map(r=>r.name);
    assert.deepEqual([...after].sort(),[...new Set([...before,MIGRATION])].sort());
    report.migrationVerified=true; save();
    stage('deploy'); report.deploymentAttempted=true; save(); cli(['deploy'],300000);
    stage('verify');
    let healthy=false;
    for (let i=0;i<6;i++) {
      try { const r=await get('/api/health'),h=await r.json(); healthy=r.ok&&h.ok===true&&h.build===RELEASE&&h.mode==='account-preview'&&h.database?.ready===true; if(healthy) break; } catch {}
      if(i<5) await new Promise(r=>setTimeout(r,5000));
    }
    assert.equal(healthy,true);
    const postSettings=await api('settings'); configuration(postSettings);
    assert.deepEqual(postSettings.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort(),secrets);
    assert.equal(postSettings.bindings.find(b=>b.name==='SIMPLICITY_READ_ONLY')?.text,'true');
    for (const path of ['/','/simplicity.html','/simplicity.js','/simplicity-view.mjs']) assert.equal((await get(path)).ok,true);
    const {validateFundView}=await import(pathToFileURL(join(source,'site/simplicity-view.mjs')).href);
    const headers={Origin:APP,'Sec-Fetch-Site':'same-origin'};
    const series='simplicity:kiwisaver:high-growth', path='/api/v1/fund?series='+encodeURIComponent(series);
    const first=await get(path,headers); assert.equal(first.status,200); const a=await first.json(); validateFundView(a,series); assert.equal(a.snapshot.identityVerified,false); assert.equal(a.snapshot.alertEligible,false);
    const second=await get(path,headers); assert.equal(second.status,200); const b=await second.json(); validateFundView(b,series); assert.equal(b.cache?.state,'cached'); assert.equal(b.snapshot.fetchedAt,a.snapshot.fetchedAt);
    assert.equal((await get(path,{Origin:'https://example.invalid','Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await get('/api/v1/watchlist',headers)).status,401);
    for (const route of ['/api/v1/alert-destination/email','/api/v1/alert-destination/email/verify','/api/v1/alert-consent/email']) assert.ok([404,503].includes((await get(route,headers)).status));
    report.deploymentVerified=true; report.secretBindingNamesPreserved=true; report.fundChecks={seriesId:series,observationDate:b.snapshot.asOfDate,cacheReused:true,identityVerified:false,alertsEnabled:false}; report.outcome='passed'; report.stage='complete';
  } catch { report.outcome='failed'; report.failedStage=report.stage; process.exitCode=1; }
  finally { save(); }
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await execute();
