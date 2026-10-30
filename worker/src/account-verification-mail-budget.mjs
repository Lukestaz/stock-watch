// Trusted internal verification-mail quota adapter; not production-wired.
const defaults={globalDaily:50,globalMinute:5,userDaily:3,destinationDaily:3,cooldownSeconds:60};
export function createD1VerificationMailBudget(db,limits={}){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(k=>!Object.hasOwn(defaults,k)))throw Error('Invalid mail budget');
 const cap={...defaults,...limits};
 for(const [key,value] of Object.entries(cap))if(!Number.isSafeInteger(value)||value<(key==='cooldownSeconds'?0:1)||value>100000)throw Error('Invalid mail budget');
 return async ({userId,destinationHash,now}={})=>{
  if(typeof userId!=='string'||!userId||userId.length>256||typeof destinationHash!=='string'||!/^[a-f0-9]{64}$/.test(destinationHash)||!Number.isSafeInteger(now)||now<=0)throw Error('Invalid reservation input');
  const day=Math.floor(now/86400)*86400,minute=Math.floor(now/60)*60;
  const sql=`INSERT INTO verification_mail_reservations(id,user_id,destination_hash,created_at)
   SELECT ?,id,?,? FROM users WHERE id=?
    AND NOT EXISTS (SELECT 1 FROM verification_mail_reservations WHERE created_at>?)
    AND (SELECT count(*) FROM verification_mail_reservations WHERE created_at>=?)<?
    AND (SELECT count(*) FROM verification_mail_reservations WHERE created_at>=?)<?
    AND (SELECT count(*) FROM verification_mail_reservations WHERE user_id=? AND created_at>=?)<?
    AND (SELECT count(*) FROM verification_mail_reservations WHERE destination_hash=? AND created_at>=?)<?
    AND NOT EXISTS (SELECT 1 FROM verification_mail_reservations WHERE (user_id=? OR destination_hash=?) AND created_at>?)
   RETURNING id`;
  const args=[crypto.randomUUID(),destinationHash,now,userId,now,day,cap.globalDaily,minute,cap.globalMinute,userId,day,cap.userDaily,destinationHash,day,cap.destinationDaily,userId,destinationHash,now-cap.cooldownSeconds];
  const results=await db.batch([db.prepare(sql).bind(...args)]);
  if(!Array.isArray(results)||results.length!==1||results[0].success!==true||!Array.isArray(results[0].results))throw Error('Mail budget unavailable');
  return results[0].results.length===1;
 };
}
