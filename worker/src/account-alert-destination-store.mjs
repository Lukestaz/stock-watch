// Trusted internal adapter. Not imported by production composition.
const validUser=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validTime=value=>Number.isSafeInteger(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER-600;
const validAddress=value=>typeof value==='string'&&value.length<=254&&value.length>0&&value===value.trim()&&!/[\r\n\0]/.test(value)&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value);
export function createD1AlertDestinationStore(db,{emailProvider='shared-smtp'}={}){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||typeof emailProvider!=='string'||!/^[a-z0-9-]{1,64}$/.test(emailProvider))throw Error('Invalid verification store configuration');
 const statement=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{
  const results=await db.batch(statements);
  if(!Array.isArray(results)||results.length!==statements.length||results.some(r=>r.success!==true||!Array.isArray(r.results)))throw Error('Verification storage unavailable');
  return results;
 };
 return {
  async beginEmailVerification({userId,address,challengeHash,now,expiresAt}={}){
   if(!validUser(userId)||!validAddress(address)||!validHash(challengeHash)||!validTime(now)||!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+600)throw Error('Invalid verification input');
   const results=await batch([
    statement(`INSERT INTO alert_destinations(user_id,channel,address,provider)
     SELECT id,'email',?,? FROM users WHERE id=?
     ON CONFLICT(user_id,channel) DO UPDATE SET address=excluded.address,verified_at=NULL,enabled=0`,[address,emailProvider,userId]),
    statement('DELETE FROM alert_email_challenges WHERE user_id=?',[userId]),
    statement(`INSERT INTO alert_email_challenges(user_id,challenge_hash,destination_revision,address,provider,provider_binding_ref,created_at,expires_at)
     SELECT user_id,?,revision,address,provider,provider_binding_ref,?,? FROM alert_destinations
     WHERE user_id=? AND channel='email' RETURNING user_id`,[challengeHash,now,expiresAt,userId])
   ]);
   return results[2].results.length===1;
  },
  async completeEmailVerification({userId,challengeHash,now}={}){
   if(!validUser(userId)||!validHash(challengeHash)||!validTime(now))throw Error('Invalid verification input');
   const results=await batch([
    statement(`UPDATE alert_email_challenges SET consumed_at=?
     WHERE user_id=? AND challenge_hash=? AND consumed_at IS NULL AND created_at<=? AND expires_at>?
      AND EXISTS (SELECT 1 FROM alert_destinations d WHERE d.user_id=alert_email_challenges.user_id
       AND d.channel='email' AND d.revision=alert_email_challenges.destination_revision
       AND d.address=alert_email_challenges.address AND d.provider=alert_email_challenges.provider
       AND d.provider_binding_ref IS alert_email_challenges.provider_binding_ref)
     RETURNING user_id`,[now,userId,challengeHash,now,now])
   ]);
   return results[0].results.length===1;
  }
 };
}
