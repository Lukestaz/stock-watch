// Trusted internal queue adapter. All methods default disabled; no HTTP endpoints.
export function createD1EmailOutbox(db,{enabled=false,provider='shared-smtp',bindingRef=null,leaseSeconds=120}={}){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||typeof provider!=='string'||!provider||!Number.isInteger(leaseSeconds)||leaseSeconds<60||leaseSeconds>600)throw Error('Invalid email outbox');
 const stmt=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{let r;try{r=await db.batch(statements);}catch{throw Error('Email outbox unavailable');}if(!Array.isArray(r)||r.length!==statements.length||r.some(x=>x.success!==true||!Array.isArray(x.results)))throw Error('Email outbox unavailable');return r;};
 const time=now=>{if(!Number.isSafeInteger(now)||now<=0||now>Number.MAX_SAFE_INTEGER-600)throw Error('Invalid dispatch time');};
 const eligible=`q.observed_at BETWEEN ? AND ? AND EXISTS (
  SELECT 1 FROM watchlist_entries e JOIN account_alert_monitors m ON m.user_id=e.user_id AND m.symbol=e.symbol
   JOIN alert_destinations d ON d.user_id=e.user_id AND d.channel='email'
   JOIN account_alert_events v ON v.user_id=q.user_id AND v.symbol=q.symbol AND v.target_revision=q.target_revision AND v.kind=q.kind AND v.observed_at=q.observed_at
  WHERE e.user_id=q.user_id AND e.symbol=q.symbol AND e.target_revision=q.target_revision AND e.target_usd=v.target_usd
   AND e.alerts_enabled=1 AND e.email_enabled=1 AND m.target_revision=e.target_revision AND m.consent_revision=q.consent_revision
   AND q.observed_at>m.enabled_at AND d.enabled=1 AND d.verified_at IS NOT NULL AND d.revision=q.destination_revision
   AND d.provider=? AND d.provider_binding_ref IS ?)`;
 const args=now=>[now-7200,now-900,provider,bindingRef];
 const payload=`SELECT q.user_id AS userId,q.symbol,q.kind,q.observed_at AS observedAt,q.claim_token AS claimToken,q.dispatch_token AS dispatchToken,
  d.address AS recipient,v.target_usd AS target,v.low_usd AS low FROM account_alert_deliveries q
  JOIN account_alert_events v ON v.user_id=q.user_id AND v.symbol=q.symbol AND v.target_revision=q.target_revision AND v.kind=q.kind AND v.observed_at=q.observed_at
  JOIN alert_destinations d ON d.user_id=q.user_id AND d.channel='email'`;
 return {
  async claim(now){
   if(enabled!==true)return null;time(now);const token=crypto.randomUUID();
   const r=await batch([
    stmt("UPDATE account_alert_deliveries SET status=CASE WHEN send_started_at IS NULL THEN 'pending' ELSE 'outcome_unknown' END,claim_token=NULL,dispatch_token=NULL,claim_until=NULL,last_error_category='lease_expired',updated_at=? WHERE channel='email' AND status='claimed' AND (claim_until IS NULL OR claim_until<=?)",[now,now]),
    stmt(`UPDATE account_alert_deliveries AS q SET status=CASE WHEN observed_at<? THEN 'expired' ELSE 'superseded' END,updated_at=? WHERE channel='email' AND status='pending' AND NOT (`+eligible+')',[now-7200,now,...args(now)]),
    stmt("UPDATE account_alert_deliveries SET status='failed',updated_at=? WHERE channel='email' AND status='pending' AND attempts>=3",[now]),
    stmt(`UPDATE account_alert_deliveries SET status='claimed',claim_token=?,claim_until=?,dispatch_token=NULL,send_started_at=NULL,updated_at=?
     WHERE rowid=(SELECT q.rowid FROM account_alert_deliveries q WHERE q.channel='email' AND q.status='pending' AND q.attempts<3 AND `+eligible+` ORDER BY q.observed_at,q.user_id,q.symbol,q.kind LIMIT 1) AND status='pending'`,[token,now+leaseSeconds,now,...args(now)]),
    stmt(payload+" WHERE q.claim_token=? AND q.status='claimed' AND q.send_started_at IS NULL AND "+eligible,[token,...args(now)])
   ]);return r[4].results[0]||null;
  },
  async start(claimToken,now){
   if(enabled!==true)return null;time(now);const dispatchToken=crypto.randomUUID();
   const r=await batch([
    stmt(`UPDATE account_alert_deliveries AS q SET send_started_at=?,dispatch_token=?,attempts=attempts+1,updated_at=?
     WHERE q.claim_token=? AND q.status='claimed' AND q.send_started_at IS NULL AND q.claim_until>? AND q.attempts<3 AND `+eligible,[now,dispatchToken,now,claimToken,now,...args(now)]),
    stmt(payload+" WHERE q.claim_token=? AND q.dispatch_token=? AND q.status='claimed' AND "+eligible,[claimToken,dispatchToken,...args(now)]),
    stmt(`UPDATE account_alert_deliveries AS q SET status='superseded',claim_token=NULL,claim_until=NULL,updated_at=? WHERE q.claim_token=? AND q.status='claimed' AND q.send_started_at IS NULL AND NOT (`+eligible+')',[now,claimToken,...args(now)])
   ]);return r[1].results[0]||null;
  },
  async defer(claimToken,now){
   if(enabled!==true)return false;time(now);const r=await batch([stmt("UPDATE account_alert_deliveries SET claim_until=?,updated_at=? WHERE claim_token=? AND status='claimed' AND send_started_at IS NULL RETURNING user_id",[now+60,now,claimToken])]);return r[0].results.length===1;
  },
  async finish({claimToken,dispatchToken,outcome,now}={}){
   if(enabled!==true)return false;time(now);if(!['accepted','not_sent','failed','outcome_unknown'].includes(outcome))throw Error('Invalid dispatch outcome');
   const r=await batch([stmt(`UPDATE account_alert_deliveries SET status=CASE ? WHEN 'accepted' THEN 'accepted' WHEN 'not_sent' THEN CASE WHEN attempts<3 THEN 'pending' ELSE 'failed' END WHEN 'failed' THEN 'failed' ELSE 'outcome_unknown' END,
    last_error_category=?,updated_at=?,claim_token=NULL,dispatch_token=NULL,claim_until=NULL WHERE claim_token=? AND dispatch_token=? AND status='claimed' AND send_started_at IS NOT NULL RETURNING user_id`,[outcome,outcome==='accepted'?null:outcome,now,claimToken,dispatchToken])]);return r[0].results.length===1;
  }
 };
}
