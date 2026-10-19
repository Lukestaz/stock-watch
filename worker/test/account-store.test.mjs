import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createD1WatchlistStore} from '../src/account-store.mjs';
globalThis.crypto ??= webcrypto;
const bridge=fileURLToPath(new URL('../../tests/schema/sqlite_d1_bridge.py',import.meta.url));
const stock=(symbol='LUNR',target=10)=>({symbol,target,alertsEnabled:false});
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'watchlist-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'test.sqlite');
 execFileSync('python3',[bridge,path,'init']);
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:statements=>new Promise((resolve,reject)=>{
  const child=spawn('python3',[bridge,path,'batch']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
  child.stdin.on('error',reject);child.stdin.end(JSON.stringify(statements));
 })};
 return {db,store:createD1WatchlistStore(db)};
}
const query=(db,sql,args=[])=>db.batch([db.prepare(sql).bind(...args)]).then(r=>r[0].results);
test('read and save are scoped to one user',async t=>{const {store}=fixture(t);assert.deepEqual(await store.read('u1'),{revision:0,monitorAppliedRevision:null,stocks:[]});assert.equal((await store.replace('u1',0,[stock()])).revision,1);await store.replace('u2',0,[stock('LUNR',20)]);assert.equal((await store.read('u1')).stocks[0].target,10);assert.equal((await store.read('u2')).stocks[0].target,20);});
test('stale save cannot delete or overwrite winner',async t=>{const {store}=fixture(t);await store.replace('u1',0,[stock()]);assert.equal(await store.replace('u1',0,[stock('OTHER')]),null);assert.deepEqual((await store.read('u1')).stocks,[stock()]);});
test('overlapping writers yield one winner',async t=>{const {store}=fixture(t);const results=await Promise.all([store.replace('u1',0,[stock('FIRST')]),store.replace('u1',0,[stock('SECOND')])]);assert.equal(results.filter(r=>r===null).length,1);const winner=results.find(r=>r!==null);assert.deepEqual(await store.read('u1'),winner);});
test('database error rolls back revision and deleted entries',async t=>{const {store,db}=fixture(t);await store.replace('u1',0,[stock()]);await query(db,"CREATE TRIGGER fail_test BEFORE INSERT ON watchlist_entries WHEN NEW.symbol='FAIL' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");await assert.rejects(store.replace('u1',1,[stock('FAIL')]));assert.deepEqual(await store.read('u1'),{revision:1,monitorAppliedRevision:null,stocks:[stock()]});});
test('replace at capacity, order and clearing',async t=>{const {store}=fixture(t);const stocks=Array.from({length:100},(_,i)=>stock('T'+i));await store.replace('u1',0,stocks);const replacement=[stock('NEW'),...stocks.slice(1).reverse()];assert.deepEqual((await store.replace('u1',1,replacement)).stocks,replacement);assert.deepEqual((await store.replace('u1',2,[])).stocks,[]);});
test('target revisions track target changes, not reorder',async t=>{const {store,db}=fixture(t);await store.replace('u1',0,[stock('A'),stock('B')]);await query(db,'UPDATE watchlists SET monitor_applied_revision=1 WHERE user_id=?',['u1']);await store.replace('u1',1,[stock('B'),stock('A')]);let rows=await query(db,'SELECT symbol,target_revision FROM watchlist_entries WHERE user_id=? ORDER BY symbol',['u1']);assert.deepEqual(rows,[{symbol:'A',target_revision:1},{symbol:'B',target_revision:1}]);await store.replace('u1',2,[stock('B'),stock('A',12)]);rows=await query(db,'SELECT target_revision FROM watchlist_entries WHERE user_id=? AND symbol=?',['u1','A']);assert.equal(rows[0].target_revision,3);assert.equal((await store.read('u1')).monitorAppliedRevision,1);await store.replace('u1',3,[]);await store.replace('u1',4,[stock('A')]);rows=await query(db,'SELECT target_revision FROM watchlist_entries WHERE user_id=?',['u1']);assert.equal(rows[0].target_revision,5);});
test('active alerts cannot be silently removed by full-list save',async t=>{const {store,db}=fixture(t);await store.replace('u1',0,[stock()]);await query(db,'UPDATE watchlist_entries SET alerts_enabled=1,email_enabled=1 WHERE user_id=?',['u1']);assert.equal(await store.replace('u1',1,[]),null);const saved=await store.read('u1');assert.equal(saved.revision,1);assert.equal(saved.stocks[0].alertsEnabled,true);});
test('adapter rejects invalid inputs and missing accounts',async t=>{const {store}=fixture(t);await assert.rejects(store.read('missing'));await assert.rejects(store.read(''));await assert.rejects(store.replace('u1',0,[{...stock(),alertsEnabled:true}]));await assert.rejects(store.replace('u1',0,[stock('A!')]));await assert.rejects(store.replace('u1',0,Array.from({length:101},(_,i)=>stock('T'+i))));assert.equal(await store.replace('missing',0,[stock()]),null);assert.equal((await store.read('u1')).revision,0);});
