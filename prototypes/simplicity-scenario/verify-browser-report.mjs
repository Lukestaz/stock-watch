import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const CASES=['catalogue and unavailable nowcast','arithmetic and invalidation','scheme isolation','missing return rejected','acknowledgement required','export provenance','viewport and keyboard'];
export function validate(report){
 if(!report || !report.stats || !Array.isArray(report.suites))throw Error('Missing browser report/stats/suites');
 const projects=report.config?.projects?.map(p=>p.name).sort();
 if(JSON.stringify(projects)!==JSON.stringify(['chromium-desktop','webkit-mobile']))throw Error('Both required browser projects must be configured exactly once');
 for(const [key,n] of Object.entries({expected:14,unexpected:0,skipped:0,flaky:0}))if(report.stats[key]!==n)throw Error('Unexpected stats '+key);
 if(!Array.isArray(report.errors)||report.errors.length)throw Error('Missing or nonempty global errors');
 const tests=[];
 function walk(s){for(const spec of s.specs??[])for(const t of spec.tests??[])tests.push({title:spec.title,...t});for(const child of s.suites??[])walk(child);}
 report.suites.forEach(walk);
 if(tests.length!==14)throw Error('Expected exactly fourteen project-case executions');
 const seen=new Set();
 for(const t of tests){const key=t.projectName+':'+t.title;
  if(!projects.includes(t.projectName)||!CASES.includes(t.title)||seen.has(key))throw Error('Unexpected or duplicated project/case');
  seen.add(key);
  if(t.status!=='expected'||t.expectedStatus!=='passed'||t.results?.length!==1||t.results[0].status!=='passed'||t.results[0].errors?.length)throw Error('Nonpassing, retried or expected-failure execution');
 }
 return {outcome:'passed',passed:14,failed:0,skipped:0,flaky:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result,exit=0;
 try{result=validate(JSON.parse(readFileSync(process.argv[2],'utf8')));}catch(e){result={outcome:'failed',error:e.message};exit=1;}
 const summary={schemaVersion:1,scope:'scenario-browser-report-validation',sourceSha:process.env.GITHUB_SHA??null,sourceRef:process.env.GITHUB_REF??null,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,recordedAt:new Date().toISOString(),...result};
 writeFileSync(process.argv[3]??'scenario-browser-summary.json',JSON.stringify(summary,null,2)+'\n');process.exitCode=exit;
}
