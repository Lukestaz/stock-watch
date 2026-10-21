import {validateUpdate} from './account-api.mjs';
export const SNAPSHOT_SQL=`SELECT w.revision,w.monitor_applied_revision,
 (SELECT json_group_array(json_object('symbol',symbol,'target',target_usd,'alertsEnabled',alerts_enabled))
  FROM (SELECT symbol,target_usd,alerts_enabled FROM watchlist_entries WHERE user_id=w.user_id ORDER BY position,symbol)) AS stocks
 FROM watchlists w WHERE w.user_id=?`;
const snapshot=row=>{
 if(!row)throw Error('Watchlist not provisioned');
 return {revision:row.revision,monitorAppliedRevision:row.monitor_applied_revision,
  stocks:JSON.parse(row.stocks).map(s=>({...s,alertsEnabled:s.alertsEnabled===1}))};
};
const user=id=>{if(typeof id!=='string'||!id||id.length>256)throw Error('Invalid principal');return id;};
export function createD1WatchlistStore(db){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')throw Error('D1 binding required');
 const statement=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{
  const results=await db.batch(statements);
  if(results.length!==statements.length||results.some(r=>r.success!==true))throw Error('Database batch failed');
  return results;
 };
 return {
  async read(userId){
   const results=await batch([statement(SNAPSHOT_SQL,[user(userId)])]);
   return snapshot(results[0].results[0]);
  },
  async replace(userId,expectedRevision,stocks){
   user(userId);const update=validateUpdate({expectedRevision,stocks});
   if(update.stocks.some(s=>s.alertsEnabled))throw Error('Alert enrollment unavailable');
   const token=crypto.randomUUID(),data=JSON.stringify(update.stocks);
   const results=await batch([
    statement(`UPDATE watchlists SET revision=revision+1,write_token=?,updated_at=unixepoch()
     WHERE user_id=? AND revision=?
     AND NOT EXISTS (SELECT 1 FROM watchlist_entries WHERE user_id=? AND alerts_enabled=1)
     RETURNING revision`,[token,userId,expectedRevision,userId]),
    statement(`DELETE FROM watchlist_entries WHERE user_id=?
     AND EXISTS (SELECT 1 FROM watchlists WHERE user_id=? AND write_token=?)
     AND symbol NOT IN (SELECT json_extract(value,'$.symbol') FROM json_each(?))`,[userId,userId,token,data]),
    statement(`INSERT INTO watchlist_entries(user_id,symbol,target_usd,position,target_revision)
     SELECT w.user_id,json_extract(j.value,'$.symbol'),json_extract(j.value,'$.target'),CAST(j.key AS INTEGER),w.revision
     FROM watchlists w,json_each(?) j WHERE w.user_id=? AND w.write_token=?
     ON CONFLICT(user_id,symbol) DO UPDATE SET target_usd=excluded.target_usd,position=excluded.position,
      target_revision=CASE WHEN watchlist_entries.target_usd<>excluded.target_usd THEN excluded.target_revision ELSE watchlist_entries.target_revision END,
      updated_at=unixepoch()`,[data,userId,token]),
    statement(SNAPSHOT_SQL+' AND w.write_token=?',[userId,token])
   ]);
   if(!results[0].results.length)return null;
   return snapshot(results[3].results[0]);
  }
 };
}
