import fs from 'node:fs';
const env=process.env;
const short=value=>String(value||'').replace(/\u001b\[[0-9;]*m/g,'').slice(0,1200);
let report=null,reportState='missing',reportError=null;
try{
 if(fs.statSync(env.JSON_FILE).size>5*1024*1024)throw Error('Report exceeds size limit');
 report=JSON.parse(fs.readFileSync(env.JSON_FILE,'utf8'));
 for(const key of ['expected','unexpected','flaky','skipped'])if(!Number.isSafeInteger(report.stats?.[key])||report.stats[key]<0)throw Error('Invalid report counts');
 if(!Array.isArray(report.suites))throw Error('Invalid report suites');
 reportState='available';
}catch(error){report=null;reportState=error.code==='ENOENT'?'missing':'invalid';reportError=short(error.message);}
const counts=report?{passed:report.stats.expected,failed:report.stats.unexpected,flaky:report.stats.flaky,skipped:report.stats.skipped}:null;
const browsers={},failures=[],skips=[];
function walk(suites,parents=[]){for(const suite of suites){
 const path=[...parents,suite.title||''];
 for(const spec of suite.specs||[])for(const test of spec.tests||[]){
  const browser=String(test.projectName||test.projectId||'unknown').slice(0,100);
  const bucket=browsers[browser]??={passed:0,failed:0,flaky:0,skipped:0};
  const status={expected:'passed',unexpected:'failed',flaky:'flaky',skipped:'skipped'}[test.status];
  if(status)bucket[status]++;
  const title=short([...path,spec.title].filter(Boolean).join(' > '));
  if(status==='skipped'&&skips.length<20)skips.push({browser,title});
  if((status==='failed'||status==='flaky')&&failures.length<10){
   const errors=(test.results||[]).flatMap(r=>r.errors||[]).slice(0,3).map(e=>short(e.message||e.stack));
   failures.push({browser,title,errors});
  }
 }
 walk(suite.suites||[],path);
}}
if(report)walk(report.suites);
const errors=(report?.errors||[]).slice(0,10).map(e=>short(e.message||e.stack));
const jobResult=env.TEST_JOB_RESULT||'unknown';
const passed=jobResult==='success'&&report&&counts.passed>0&&counts.failed===0&&counts.flaky===0&&errors.length===0;
const outcome=passed?'passed':jobResult==='failure'||report?'failed':'unverified';
const summary={schemaVersion:1,workflow:'Dashboard regression tests',sourceBranch:'main',testedCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runNumber:env.GITHUB_RUN_NUMBER,runAttempt:env.GITHUB_RUN_ATTEMPT,runUrl:`${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,generatedAt:new Date().toISOString(),jobResult,outcome,reportState,reportError,counts,browsers,failures,skips,errors};
fs.writeFileSync(env.SUMMARY_FILE,JSON.stringify(summary,null,2)+'\n');
if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`## Dashboard regression result: ${outcome}\n\nTested commit: ${summary.testedCommit}\n\nJob result: ${jobResult}; report: ${reportState}\n\n${counts?`Passed ${counts.passed}; failed ${counts.failed}; flaky ${counts.flaky}; skipped ${counts.skipped}`:'Counts unavailable: tests did not run or their report is missing/invalid.'}\n\nRepository-readable result: ci-results branch, dashboard/latest.json (after the save step succeeds).\n`);
console.log(JSON.stringify({outcome,reportState,counts}));
