const fs=require('node:fs');
const BRANCH='refs/heads/feat/simplicity-scenario-prototype';
const numeric=v=>/^[1-9]\d*$/.test(String(v));
function isNewer(a,b){
 if(!b)return true;
 if(!numeric(a.runId)||!numeric(a.runAttempt)||!numeric(b.runId)||!numeric(b.runAttempt))throw Error('Invalid run ordering metadata');
 const x=BigInt(a.runId),y=BigInt(b.runId);
 return x>y||(x===y&&BigInt(a.runAttempt)>BigInt(b.runAttempt));
}
function buildRecord(summary,meta,jobResult){
 if(!/^[0-9a-f]{40}$/.test(meta.sourceSha)||meta.sourceRef!==BRANCH||!numeric(meta.runId)||!numeric(meta.runAttempt)||!numeric(meta.runNumber))throw Error('Invalid trusted run metadata');
 if(!['success','failure','cancelled','skipped'].includes(jobResult))throw Error('Unknown test job conclusion');
 const matched=!!summary&&summary.scope==='scenario-browser-report-validation'&&summary.sourceSha===meta.sourceSha&&summary.sourceRef===meta.sourceRef&&String(summary.runId)===String(meta.runId)&&String(summary.runAttempt)===String(meta.runAttempt);
 const passed=matched&&summary.outcome==='passed'&&summary.passed===14&&summary.failed===0&&summary.skipped===0&&summary.flaky===0;
 return {schemaVersion:1,scope:'scenario-test-job',sourceSha:meta.sourceSha,sourceRef:meta.sourceRef,runId:String(meta.runId),runAttempt:String(meta.runAttempt),runNumber:String(meta.runNumber),recordedAt:new Date().toISOString(),runUrl:`https://github.com/Lukestaz/stock-watch/actions/runs/${meta.runId}`,jobResult,workflowConclusion:null,outcome:jobResult==='success'&&passed?'passed':jobResult==='cancelled'?'cancelled':'failed',browserValidation:passed?'passed':matched&&summary.outcome==='failed'?'failed':'unverified',passed:passed?14:null,failed:passed?0:null,skipped:passed?0:null,flaky:passed?0:null,evidence:{kind:'trusted-workflow-summary',summaryAvailable:!!summary,summarySourceMatched:matched,rawReportStored:false},deployed:false,alertsActivated:false};
}
async function publish({github,context,summary,jobResult,runNumber}){
 if(context.repo.owner!=='Lukestaz'||context.repo.repo!=='stock-watch'||context.eventName!=='push'||context.ref!==BRANCH)throw Error('Untrusted publisher invocation');
 const record=buildRecord(summary,{sourceSha:context.sha,sourceRef:context.ref,runId:context.runId,runAttempt:process.env.GITHUB_RUN_ATTEMPT,runNumber},jobResult);
 const {owner,repo}=context.repo,prefix='simplicity-scenario',path=`${prefix}/runs/${record.runId}-${record.runAttempt}.json`,nl=String.fromCharCode(10);
 async function read(path,ref){try{const f=(await github.rest.repos.getContent({owner,repo,path,ref})).data;if(f.type!=='file')throw Error('Expected file');return JSON.parse(Buffer.from(f.content,'base64').toString('utf8'));}catch(e){if(e.status===404)return null;throw e;}}
 for(let attempt=0;attempt<5;attempt++){
  const head=(await github.rest.git.getRef({owner,repo,ref:'heads/ci-results'})).data.object.sha;
  const oldRun=await read(path,head);
  if(oldRun){if(oldRun.sourceSha!==record.sourceSha)throw Error('Immutable run identity conflict');return {alreadyPublished:true,path,outcome:oldRun.outcome};}
  const previous=await read(`${prefix}/latest.json`,head),text=JSON.stringify(record,null,2)+nl;
  const entries=[{path,mode:'100644',type:'blob',content:text}];
  if(isNewer(record,previous)){
   entries.push({path:`${prefix}/latest.json`,mode:'100644',type:'blob',content:text});
   const markdown=['# Simplicity scenario test result','',`Source: ${record.sourceSha}`,`Ref: ${record.sourceRef}`,`Run: ${record.runId}, attempt ${record.runAttempt}`,`Test job: ${record.jobResult}`,`Browser validation: ${record.browserValidation}`,`Outcome: ${record.outcome}`,'Workflow conclusion: unknown (publisher still executing when saved).','','See latest.json for provenance. Not deployment or alert-activation evidence.'].join(nl)+nl;
   entries.push({path:`${prefix}/latest.md`,mode:'100644',type:'blob',content:markdown});
  }
  const base=(await github.rest.git.getCommit({owner,repo,commit_sha:head})).data.tree.sha;
  const tree=(await github.rest.git.createTree({owner,repo,base_tree:base,tree:entries})).data.sha;
  const commit=(await github.rest.git.createCommit({owner,repo,message:`Scenario CI ${record.runId}/${record.runAttempt}: ${record.outcome}`,tree,parents:[head]})).data.sha;
  try{await github.rest.git.updateRef({owner,repo,ref:'heads/ci-results',sha:commit,force:false});return {commit,path,outcome:record.outcome};}catch(e){if(![409,422].includes(e.status)||attempt===4)throw e;}
 }
 throw Error('Results ref update did not complete');
}
module.exports={isNewer,buildRecord,publish,readSummary(path){try{return JSON.parse(fs.readFileSync(path,'utf8'));}catch{return null;}}};
