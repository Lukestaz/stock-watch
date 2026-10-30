// Candidate private consent/event producer only: no provider calls or runtime imports.
const user=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const revision=value=>Number.isSafeInteger(value)&&value>=0&&value<Number.MAX_SAFE_INTEGER;
const timestamp=value=>Number.isSafeInteger(value)&&value>0;
const symbol=value=>typeof value==='string'&&/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(value);
export function createD1AccountAlertStore(db,{enrollmentEnabled=false,evaluationEnabled=false}={}){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')throw Error('Account alert storage required');
 const stmt=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{const r=await db.batch(statements);if(!Array.isArray(r)||r.length!==statements.length||r.some(x=>x.success!==true||!Array.isArray(x.results)))throw Error('Account alert storage unavailable');return r;};
 const invalidate=now=>stmt(`UPDATE account_alert_deliveries AS q SET status=CASE WHEN observed_at<? THEN 'expired' ELSE 'superseded' END,updated_at=?
  WHERE channel='email' AND status='pending' AND (observed_at<? OR NOT EXISTS (
   SELECT 1 FROM watchlist_entries e JOIN account_alert_monitors m ON m.user_id=e.user_id AND m.symbol=e.symbol
    JOIN alert_destinations d ON d.user_id=e.user_id AND d.channel='email'
    JOIN account_alert_events v ON v.user_id=q.user_id AND v.symbol=q.symbol AND v.target_revision=q.target_revision AND v.kind=q.kind AND v.observed_at=q.observed_at
   WHERE e.user_id=q.user_id AND e.symbol=q.symbol AND e.target_revision=q.target_revision AND e.target_usd=v.target_usd
    AND e.alerts_enabled=1 AND e.email_enabled=1 AND m.target_revision=e.target_revision AND m.consent_revision=q.consent_revision
    AND d.enabled=1 AND d.verified_at IS NOT NULL AND d.revision=q.destination_revision))
  RETURNING user_id`,[now-7200,now,now-7200]);
 return {
  async read(userId){
   if(!user(userId))throw Error('Invalid principal');
   const r=await batch([
    stmt('SELECT revision FROM watchlists WHERE user_id=?',[userId]),
    stmt("SELECT revision,verified_at IS NOT NULL AS verified,enabled FROM alert_destinations WHERE user_id=? AND channel='email'",[userId]),
    stmt('SELECT symbol,target_revision AS targetRevision,email_enabled AS emailEnabled,alerts_enabled AS alertsEnabled FROM watchlist_entries WHERE user_id=? ORDER BY position,symbol',[userId])
   ]);
   if(!r[0].results.length)return null;
   const d=r[1].results[0];return {revision:r[0].results[0].revision,destination:d?{revision:d.revision,verified:d.verified===1,enabled:d.enabled===1}:null,stocks:r[2].results.map(x=>({...x,emailEnabled:x.emailEnabled===1,alertsEnabled:x.alertsEnabled===1}))};
  },
  async setEmailConsent({userId,symbol:stock,expectedWatchlistRevision,expectedTargetRevision,expectedDestinationRevision,enabled,now}={}){
   if(!user(userId)||!symbol(stock)||!revision(expectedWatchlistRevision)||!revision(expectedTargetRevision)||typeof enabled!=='boolean'||!timestamp(now)||(enabled&&(!revision(expectedDestinationRevision)||expectedDestinationRevision<1)))throw Error('Invalid consent input');
   if(enabled&&enrollmentEnabled!==true)throw Error('Alert enrollment unavailable');
   const token=crypto.randomUUID(),value=enabled?1:0;
   const owner='EXISTS (SELECT 1 FROM watchlists w WHERE w.user_id=? AND w.write_token=?)';
   const r=await batch([
    stmt(`UPDATE watchlists SET revision=revision+1,write_token=?,updated_at=? WHERE user_id=? AND revision=?
     AND EXISTS (SELECT 1 FROM watchlist_entries WHERE user_id=? AND symbol=? AND target_revision=?)
     AND (?=0 OR EXISTS (SELECT 1 FROM alert_destinations WHERE user_id=? AND channel='email' AND revision=? AND verified_at IS NOT NULL))
     RETURNING revision`,[token,now,userId,expectedWatchlistRevision,userId,stock,expectedTargetRevision,value,userId,expectedDestinationRevision??0]),
    stmt(`UPDATE watchlist_entries SET email_enabled=?,alerts_enabled=CASE WHEN ?=1 OR whatsapp_enabled=1 THEN 1 ELSE 0 END,updated_at=?
     WHERE user_id=? AND symbol=? AND `+owner,[value,value,now,userId,stock,userId,token]),
    stmt(`UPDATE alert_destinations SET enabled=CASE WHEN ?=1 THEN 1 WHEN NOT EXISTS
     (SELECT 1 FROM watchlist_entries e WHERE e.user_id=? AND e.alerts_enabled=1 AND e.email_enabled=1) THEN 0 ELSE enabled END
     WHERE user_id=? AND channel='email' AND `+owner,[value,userId,userId,userId,token]),
    stmt(`INSERT INTO account_alert_monitors(user_id,symbol,target_revision,consent_revision,enabled_at,last_observed_at)
     SELECT user_id,symbol,target_revision,1,?,? FROM watchlist_entries WHERE user_id=? AND symbol=? AND `+owner+`
     ON CONFLICT(user_id,symbol) DO UPDATE SET target_revision=excluded.target_revision,consent_revision=account_alert_monitors.consent_revision+1,
      enabled_at=excluded.enabled_at,last_observed_at=excluded.last_observed_at,armed_near=1,armed_target=1,evaluation_token=NULL`,[now,now,userId,stock,userId,token]),
    stmt(`UPDATE account_alert_deliveries SET status='cancelled',updated_at=? WHERE user_id=? AND symbol=? AND channel='email' AND status='pending' AND `+owner,[now,userId,stock,userId,token])
   ]);
   return r[0].results.length?{revision:r[0].results[0].revision,enabled}:null;
  },
  async invalidatePending(now){
   if(evaluationEnabled!==true)return 0;if(!timestamp(now))throw Error('Invalid evaluation time');
   return (await batch([invalidate(now)]))[0].results.length;
  },
  async evaluate({symbol:stock,low,close,observedAt,now}={}){
   const zero={processed:0,eventsCreated:0,deliveriesCreated:0};if(evaluationEnabled!==true)return zero;
   if(!symbol(stock)||typeof low!=='number'||typeof close!=='number'||!Number.isFinite(low)||!Number.isFinite(close)||low<=0||close<=0||low>close||close>1e9||!timestamp(observedAt)||!timestamp(now))throw Error('Invalid market observation');
   const age=now-observedAt;if(age<900||age>3600)return zero;
   const token=crypto.randomUUID();
   const r=await batch([
    invalidate(now),
    stmt(`UPDATE account_alert_monitors AS m SET last_observed_at=?,evaluation_token=?,
     armed_near=CASE WHEN ?>e.target_usd*1.07 THEN 1 ELSE m.armed_near END,
     armed_target=CASE WHEN ?>e.target_usd*1.02 THEN 1 ELSE m.armed_target END
     FROM watchlist_entries e,alert_destinations d WHERE m.user_id=e.user_id AND m.symbol=e.symbol
      AND d.user_id=e.user_id AND d.channel='email' AND e.symbol=? AND e.alerts_enabled=1 AND e.email_enabled=1
      AND d.enabled=1 AND d.verified_at IS NOT NULL AND m.target_revision=e.target_revision
      AND ?>m.last_observed_at AND ?>m.enabled_at RETURNING user_id`,[observedAt,token,close,close,stock,observedAt,observedAt]),
    stmt(`INSERT OR IGNORE INTO account_alert_events(user_id,symbol,target_revision,kind,observed_at,target_usd,low_usd,created_at)
     SELECT m.user_id,m.symbol,m.target_revision,CASE WHEN ?<=e.target_usd THEN 'target' ELSE 'near' END,?,e.target_usd,?,?
     FROM account_alert_monitors m JOIN watchlist_entries e ON e.user_id=m.user_id AND e.symbol=m.symbol
     WHERE m.evaluation_token=? AND ?<=e.target_usd*1.05
      AND ((?<=e.target_usd AND m.armed_target=1) OR (?>e.target_usd AND m.armed_near=1)) RETURNING user_id`,[low,observedAt,low,now,token,low,low,low]),
    stmt(`INSERT OR IGNORE INTO account_alert_deliveries(user_id,symbol,target_revision,kind,observed_at,channel,destination_revision,consent_revision,updated_at)
     SELECT v.user_id,v.symbol,v.target_revision,v.kind,v.observed_at,'email',d.revision,m.consent_revision,?
     FROM account_alert_events v JOIN account_alert_monitors m ON m.user_id=v.user_id AND m.symbol=v.symbol AND m.target_revision=v.target_revision
      JOIN alert_destinations d ON d.user_id=v.user_id AND d.channel='email'
     WHERE m.evaluation_token=? AND v.observed_at=? RETURNING user_id`,[now,token,observedAt]),
    stmt(`UPDATE account_alert_monitors AS m SET
     armed_near=CASE WHEN EXISTS (SELECT 1 FROM account_alert_events v WHERE v.user_id=m.user_id AND v.symbol=m.symbol AND v.target_revision=m.target_revision AND v.observed_at=?) THEN 0 ELSE armed_near END,
     armed_target=CASE WHEN EXISTS (SELECT 1 FROM account_alert_events v WHERE v.user_id=m.user_id AND v.symbol=m.symbol AND v.target_revision=m.target_revision AND v.observed_at=? AND v.kind='target') THEN 0 ELSE armed_target END,
     evaluation_token=NULL WHERE evaluation_token=?`,[observedAt,observedAt,token])
   ]);
   return {processed:r[1].results.length,eventsCreated:r[2].results.length,deliveriesCreated:r[3].results.length};
  }
 };
}
