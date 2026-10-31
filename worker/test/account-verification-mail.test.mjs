import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1VerificationMailBudget} from '../src/account-verification-mail-budget.mjs';
import {createVerificationMailer} from '../src/account-verification-mailer.mjs';
import {createAlertDestinationRoutes} from '../src/account-alert-destinations.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
function fixture(t,limits={}){
 const dir=mkdtempSync(join(tmpdir(),'verification-budget-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
  child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 return {db,reserve:createD1VerificationMailBudget(db,limits)};
}
const reservation=(userId='u1',destinationHash='a'.repeat(64),now=1000000)=>({userId,destinationHash,now});
const input={userId:'u1',to:'Alice@EXAMPLE.INVALID',token:'c'.repeat(64),expiresAt:1000600};
const config={enabled:true,from:'sender@example.invalid',clock:()=>1000000};
test('disabled mailer has no side effects',async()=>{
 let calls=0;const mail=createVerificationMailer({from:config.from,send:()=>calls++,reserve:()=>calls++});
 assert.equal(await mail(input),false);assert.equal(calls,0);
});
test('fixed sender, one recipient and template use a committed reservation',async t=>{
 const {db,reserve}=fixture(t);const sent=[];
 const mail=createVerificationMailer({...config,reserve,send:async message=>{assert.equal((await query(db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);sent.push(message);return {outcome:'accepted'};}});
 assert.equal(await mail({...input,from:'attacker@example.invalid',subject:'override',text:'override'}),true);
 assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['from','subject','text','to']);
 assert.equal(sent[0].from,config.from);assert.equal(sent[0].to,'Alice@example.invalid');assert.equal(sent[0].subject,'[Stock Watch] Verify your email address');
 assert.ok(sent[0].text.includes(input.token));assert.ok(sent[0].text.includes('does not enable stock alerts'));
 const rows=await query(db,'SELECT * FROM verification_mail_reservations');assert.ok(!JSON.stringify(rows).includes(input.token));assert.ok(!JSON.stringify(rows).includes('example.invalid'));
});
test('per-user and destination cooldown boundaries persist',async t=>{
 const {reserve}=fixture(t);assert.equal(await reserve(reservation()),true);
 assert.equal(await reserve(reservation('u1','b'.repeat(64),1000059)),false);
 assert.equal(await reserve(reservation('u2','a'.repeat(64),1000059)),false);
 assert.equal(await reserve(reservation('u1','a'.repeat(64),1000060)),true);
});
test('per-account daily cap does not suppress another account',async t=>{
 const {reserve}=fixture(t,{userDaily:1,cooldownSeconds:0});assert.equal(await reserve(reservation()),true);
 assert.equal(await reserve(reservation('u1','b'.repeat(64))),false);assert.equal(await reserve(reservation('u2','b'.repeat(64))),true);
});
test('per-destination cap applies across accounts',async t=>{
 const {reserve}=fixture(t,{destinationDaily:1,cooldownSeconds:0});assert.equal(await reserve(reservation()),true);assert.equal(await reserve(reservation('u2')),false);
});
test('global minute and day caps are independent',async t=>{
 const {reserve}=fixture(t,{globalMinute:1,globalDaily:2,cooldownSeconds:0});assert.equal(await reserve(reservation()),true);
 assert.equal(await reserve(reservation('u2','b'.repeat(64))),false);
 assert.equal(await reserve(reservation('u2','b'.repeat(64),1000080)),true);
 assert.equal(await reserve(reservation('u1','d'.repeat(64),1000200)),false);
});
test('concurrent reservations cannot overspend the last slot',async t=>{
 const {db,reserve}=fixture(t,{globalDaily:1,cooldownSeconds:0});
 const results=await Promise.all([reserve(reservation()),reserve(reservation('u2','b'.repeat(64)))]);
 assert.equal(results.filter(Boolean).length,1);assert.equal((await query(db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);
});
test('failed and unknown sends keep their reservation and are not retried',async t=>{
 for(const outcome of ['throw','outcome_unknown','failed']){
  const {db,reserve}=fixture(t);let calls=0;
  const mail=createVerificationMailer({...config,reserve,send:async()=>{calls++;if(outcome==='throw')throw Error('private detail');return {outcome};}});
  assert.equal(await mail(input),false);assert.equal(await mail(input),false);assert.equal(calls,1);
  assert.equal((await query(db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,1);
 }
});
test('quota denial and unavailable budget never call the sender',async()=>{
 for(const reserve of [async()=>false,async()=>{throw Error('private database detail');}]){
  let calls=0;const mail=createVerificationMailer({...config,reserve,send:async()=>{calls++;return {outcome:'accepted'};}});
  assert.equal(await mail(input),false);assert.equal(calls,0);
 }
});
test('invalid recipients, tokens and expiry fail before budget access',async()=>{
 let calls=0;const mail=createVerificationMailer({...config,reserve:async()=>{calls++;return true;},send:async()=>{calls++;return {outcome:'accepted'};}});
 for(const change of [{to:'a\r\nBcc:b@example.invalid'},{to:'a@example.invalid,b@example.invalid'},{token:'raw'},{userId:''},{expiresAt:1000000},{expiresAt:1000601}])assert.equal(await mail({...input,...change}),false);
 assert.equal(calls,0);
});
test('fixed UTC windows reset and backward clock movement fails closed',async t=>{
 const {reserve}=fixture(t,{globalDaily:1,cooldownSeconds:0});assert.equal(await reserve(reservation()),true);
 assert.equal(await reserve(reservation('u2','b'.repeat(64),999999)),false);
 assert.equal(await reserve(reservation('u2','b'.repeat(64),1036800)),true);
});
test('account deletion cannot refund global reservations',async t=>{
 const {db,reserve}=fixture(t,{globalDaily:1,cooldownSeconds:0});await reserve(reservation());await query(db,"DELETE FROM users WHERE id='u1'");
 assert.equal(await reserve(reservation('u2','b'.repeat(64))),false);
});
test('unknown users and invalid limits fail closed',async t=>{
 const {db,reserve}=fixture(t);assert.equal(await reserve(reservation('missing')),false);
 assert.throws(()=>createD1VerificationMailBudget(db,{globalDaily:0}));assert.throws(()=>createD1VerificationMailBudget(db,{unexpected:1}));
 assert.equal((await query(db,'SELECT count(*) AS n FROM verification_mail_reservations'))[0].n,0);
});
test('candidate route passes trusted identity into the budgeted mailer',async t=>{
 const {db,reserve}=fixture(t),sent=[];
 const mail=createVerificationMailer({...config,reserve,send:async message=>{sent.push(message);return {outcome:'accepted'};}});
 const origin='https://app.example.invalid';
 const route=createAlertDestinationRoutes({enabled:true,allowedOrigin:origin,authenticate:async()=>({userId:'u1'}),limit:async()=>true,clock:config.clock,store:{beginEmailVerification:async()=>true,completeEmailVerification:async()=>false},sendVerification:async message=>{assert.equal(message.userId,'u1');return mail(message);}});
 const request=new Request(origin+'/v1/alert-destination/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-User-Id':'u2'},body:JSON.stringify({address:'alice@example.invalid'})});
 assert.equal((await route(request)).status,202);assert.equal(sent.length,1);
 assert.deepEqual(await query(db,'SELECT user_id FROM verification_mail_reservations'),[{user_id:'u1'}]);
});
