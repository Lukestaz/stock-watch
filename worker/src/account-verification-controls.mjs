// Trusted internal limiter and retention controls. No public cleanup endpoint.
const defaults={admissionPerMinute:30,globalPerScopeMinute:300,registrationPerMinute:5,verificationPerMinute:20};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function createD1VerificationControls({db,admissionKey,limits={},clock=()=>Math.floor(Date.now()/1000)}={}){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||typeof admissionKey!=='function'||typeof clock!=='function'||!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(k=>!Object.hasOwn(defaults,k)))throw Error('Invalid verification controls');
 const cap={...defaults,...limits};for(const value of Object.values(cap))if(!Number.isSafeInteger(value)||value<1||value>10000)throw Error('Invalid verification controls');
 const statement=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{const r=await db.batch(statements);if(!Array.isArray(r)||r.length!==statements.length||r.some(x=>x.success!==true||!Array.isArray(x.results)))throw Error('Verification controls unavailable');return r;};
 const time=()=>{const now=clock();if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid control clock');return now;};
 const take=async(scope,actor,maximum)=>{
  if(typeof actor!=='string'||!actor||actor.length>256)return false;
  const now=time(),minute=Math.floor(now/60)*60,actorHash=await hash(scope+':'+actor);
  const r=await batch([statement(`INSERT INTO verification_request_attempts(id,scope,actor_hash,created_at)
   SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM verification_request_attempts WHERE created_at>?)
    AND (SELECT count(*) FROM verification_request_attempts WHERE scope=? AND created_at>=?)<?
    AND (SELECT count(*) FROM verification_request_attempts WHERE scope=? AND actor_hash=? AND created_at>=?)<?
   RETURNING id`,[crypto.randomUUID(),scope,actorHash,now,now,scope,minute,cap.globalPerScopeMinute,scope,actorHash,minute,maximum])]);
  return r[0].results.length===1;
 };
 return {
  admit:async request=>take('admission',await admissionKey(request),cap.admissionPerMinute),
  limit:async(request,userId,path)=>take(path==='/v1/alert-destination/email/verify'?'verification':'registration',userId,path==='/v1/alert-destination/email/verify'?cap.verificationPerMinute:cap.registrationPerMinute),
  async cleanup(){
   const cutoff=time()-172800;
   await batch([
    statement('DELETE FROM verification_request_attempts WHERE created_at<?',[cutoff]),
    statement('DELETE FROM verification_mail_reservations WHERE created_at<?',[cutoff]),
    statement('DELETE FROM alert_email_challenges WHERE expires_at<?',[cutoff])
   ]);return true;
  }
 };
}
