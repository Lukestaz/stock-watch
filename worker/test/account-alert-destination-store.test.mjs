import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1AlertDestinationStore} from '../src/account-alert-destination-store.mjs';
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'alert-verification-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
  child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 return {db,store:createD1AlertDestinationStore(db)};
}
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
const input=(userId='u1',challengeHash='a'.repeat(64),address='alice@example.invalid')=>({userId,address,challengeHash,now:1000,expiresAt:1600});
const complete=(userId='u1',challengeHash='a'.repeat(64),now=1001)=>({userId,challengeHash,now});
test('full migration chain, hash storage and disabled verification defaults',async t=>{
 const {db,store}=fixture(t);assert.equal(await store.beginEmailVerification(input()),true);
 assert.deepEqual(await query(db,'SELECT user_id,challenge_hash,consumed_at FROM alert_email_challenges'),[{user_id:'u1',challenge_hash:'a'.repeat(64),consumed_at:null}]);
 assert.deepEqual(await query(db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:null,enabled:0}]);
 assert.equal(await store.completeEmailVerification(complete()),true);
 assert.deepEqual(await query(db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:1001,enabled:0}]);
});
test('two accounts and wrong-account token isolation',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());await store.beginEmailVerification(input('u2','b'.repeat(64),'bob@example.invalid'));
 assert.equal(await store.completeEmailVerification(complete('u2')),false);assert.equal(await store.completeEmailVerification(complete()),true);
 assert.deepEqual(await query(db,'SELECT user_id,verified_at FROM alert_destinations ORDER BY user_id'),[{user_id:'u1',verified_at:1001},{user_id:'u2',verified_at:null}]);
});
test('expiry and creation boundaries fail closed',async t=>{
 const {store}=fixture(t);await store.beginEmailVerification(input());
 for(const now of [999,1600,1700])assert.equal(await store.completeEmailVerification(complete('u1','a'.repeat(64),now)),false);
 assert.equal(await store.completeEmailVerification(complete('u1','a'.repeat(64),1000)),true);
});
test('concurrent consumers have one database winner and replay fails',async t=>{
 const {store}=fixture(t);await store.beginEmailVerification(input());
 const results=await Promise.all([store.completeEmailVerification(complete()),store.completeEmailVerification(complete())]);
 assert.equal(results.filter(Boolean).length,1);assert.equal(await store.completeEmailVerification(complete()),false);
});
test('same-address reissue invalidates old hash and clears verification',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());await store.completeEmailVerification(complete());
 await query(db,"UPDATE alert_destinations SET enabled=1 WHERE user_id='u1'");
 await store.beginEmailVerification(input('u1','b'.repeat(64)));
 assert.equal(await store.completeEmailVerification(complete()),false);
 assert.deepEqual(await query(db,'SELECT verified_at,enabled FROM alert_destinations'),[{verified_at:null,enabled:0}]);
 assert.equal(await store.completeEmailVerification(complete('u1','b'.repeat(64))),true);
});
test('address replacement and binding changes invalidate snapshots',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());
 await store.beginEmailVerification(input('u1','b'.repeat(64),'new@example.invalid'));assert.equal(await store.completeEmailVerification(complete()),false);
 await query(db,"UPDATE alert_destinations SET provider_binding_ref='binding-v2' WHERE user_id='u1'");
 assert.equal(await store.completeEmailVerification(complete('u1','b'.repeat(64))),false);
});
test('registration preserves existing server-selected provider and binding',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());
 await query(db,"UPDATE alert_destinations SET provider='replacement-smtp',provider_binding_ref='binding-v2' WHERE user_id='u1'");
 await store.beginEmailVerification(input('u1','b'.repeat(64)));
 assert.deepEqual(await query(db,'SELECT provider,provider_binding_ref FROM alert_destinations'),[{provider:'replacement-smtp',provider_binding_ref:'binding-v2'}]);
 assert.equal(await store.completeEmailVerification(complete('u1','b'.repeat(64))),true);
});
test('destination deletion and recreation cannot revive an old challenge',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());await query(db,"DELETE FROM alert_destinations WHERE user_id='u1'");
 assert.deepEqual(await query(db,'SELECT user_id FROM alert_email_challenges'),[]);
 await store.beginEmailVerification(input('u1','b'.repeat(64)));assert.equal(await store.completeEmailVerification(complete()),false);
});
test('registration failure rolls back destination change and challenge replacement',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());await store.completeEmailVerification(complete());
 await query(db,"CREATE TRIGGER fail_begin BEFORE INSERT ON alert_email_challenges BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 await assert.rejects(store.beginEmailVerification(input('u1','b'.repeat(64),'new@example.invalid')));
 assert.deepEqual(await query(db,'SELECT address,verified_at FROM alert_destinations'),[{address:'alice@example.invalid',verified_at:1001}]);
 assert.equal((await query(db,'SELECT challenge_hash FROM alert_email_challenges'))[0].challenge_hash,'a'.repeat(64));
});
test('verification failure rolls back both consumption and destination update',async t=>{
 const {db,store}=fixture(t);await store.beginEmailVerification(input());
 await query(db,"CREATE TRIGGER fail_complete BEFORE UPDATE OF verified_at ON alert_destinations WHEN NEW.verified_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 await assert.rejects(store.completeEmailVerification(complete()));
 assert.equal((await query(db,'SELECT consumed_at FROM alert_email_challenges'))[0].consumed_at,null);
 assert.equal((await query(db,'SELECT verified_at FROM alert_destinations'))[0].verified_at,null);
 await query(db,'DROP TRIGGER fail_complete');assert.equal(await store.completeEmailVerification(complete()),true);
});
test('overlapping registrations retain only the final committed hash',async t=>{
 const {db,store}=fixture(t);await Promise.all([store.beginEmailVerification(input()),store.beginEmailVerification(input('u1','b'.repeat(64),'other@example.invalid'))]);
 const rows=await query(db,'SELECT challenge_hash FROM alert_email_challenges');assert.equal(rows.length,1);
 const loser=rows[0].challenge_hash==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64);
 assert.equal(await store.completeEmailVerification(complete('u1',loser)),false);assert.equal(await store.completeEmailVerification(complete('u1',rows[0].challenge_hash)),true);
});
test('missing accounts and invalid inputs do not create destinations',async t=>{
 const {db,store}=fixture(t);assert.equal(await store.beginEmailVerification(input('missing')),false);
 for(const changes of [{userId:''},{challengeHash:'raw-token'},{address:'a\r\nBcc:b@example.invalid'},{expiresAt:1700},{now:NaN}])await assert.rejects(store.beginEmailVerification({...input(),...changes}));
 assert.deepEqual(await query(db,'SELECT user_id FROM alert_destinations'),[]);
});
