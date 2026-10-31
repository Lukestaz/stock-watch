import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailConsentClient,mountFriendsEmailSettings} from '../../site/account-friends-email.mjs';
import {createAccountAlertConsentApi} from '../src/account-alert-consent-api.mjs';
const snapshot={revision:2,destination:{revision:3,verified:true,enabled:false},stocks:[{symbol:'ABC',targetRevision:1,emailEnabled:false,alertsEnabled:false}]};
const response=(value=snapshot,account='u1')=>Response.json(value,{headers:{'X-Watchlist-Account':account}});
test('load captures account identity and save sends only exact revision-checked consent',async()=>{
 const calls=[];const client=createEmailConsentClient({fetcher:async(path,options)=>{calls.push({path,options});return options.method==='GET'?response():Response.json({revision:3,enabled:true});}});
 assert.equal((await client.load()).kind,'loaded');assert.equal((await client.save('ABC',true)).kind,'saved');assert.equal(client.view().stocks[0].emailEnabled,true);
 const put=calls[1].options;assert.equal(put.headers['X-Watchlist-Account'],'u1');assert.deepEqual(JSON.parse(put.body),{symbol:'ABC',enabled:true,expectedWatchlistRevision:2,expectedTargetRevision:1,expectedDestinationRevision:3});assert.equal(put.credentials,'same-origin');assert.equal(put.redirect,'error');
});
test('unverified destinations cannot be enabled but active alerts can be disabled',async()=>{
 let calls=0;const client=createEmailConsentClient({fetcher:async(path,o)=>{calls++;return o.method==='GET'?response({...snapshot,destination:{revision:3,verified:false,enabled:false},stocks:[{...snapshot.stocks[0],emailEnabled:true}]}):Response.json({revision:3,enabled:false});}});
 await client.load();assert.equal((await client.save('ABC',true)).kind,'unavailable');assert.equal(calls,1);assert.equal((await client.save('ABC',false)).kind,'saved');
});
test('missing identity and malformed snapshots fail closed',async()=>{const client=createEmailConsentClient({fetcher:async()=>Response.json(snapshot)});assert.equal((await client.load()).kind,'unavailable');assert.equal(client.view(),null);});
test('conflicts clear stale snapshots without automatic retry',async()=>{
 let calls=0;const client=createEmailConsentClient({fetcher:async()=>++calls===1?response():new Response('{}',{status:409})});await client.load();assert.equal((await client.save('ABC',true)).kind,'conflict');assert.equal(client.view(),null);assert.equal(calls,2);
});
test('session reset aborts and discards a pending response',async()=>{
 let resolve,signal;const client=createEmailConsentClient({fetcher:async(path,o)=>{signal=o.signal;return new Promise(r=>resolve=r);}});const pending=client.load();await Promise.resolve();client.reset();resolve(response());assert.equal((await pending).kind,'stale');assert.equal(signal.aborted,true);assert.equal(client.view(),null);
});
test('consent GET returns authenticated account metadata and rejects another account precondition',async()=>{
 const api=createAccountAlertConsentApi({enabled:true,allowedOrigin:'https://app.example.invalid',authenticate:async()=>({userId:'u1'}),admit:async()=>true,limit:async()=>true,store:{read:async()=>snapshot,setEmailConsent:async()=>null}});
 const req=account=>new Request('https://app.example.invalid/v1/alert-consent/email',{headers:{Origin:'https://app.example.invalid',...(account?{'X-Watchlist-Account':account}:{})}});
 const r=await api(req());assert.equal(r.status,200);assert.equal(r.headers.get('X-Watchlist-Account'),'u1');assert.equal((await api(req('u2'))).status,409);
});
class Node{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.textContent='';this.value='';this.attrs={};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attrs[k]=v;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
function panel(fetcher,available=true){
 const doc={createElement:tag=>new Node(tag,doc)},root=new Node('main',doc);let fn,unsaved=false;
 const session={subscribe:f=>{fn=f;f('signed-in');return()=>fn=null;},hasUnsaved:()=>unsaved};
 const mounted=mountFriendsEmailSettings({root,session,enrollmentAvailable:available,fetcher});
 const all=()=>{const out=[];const visit=n=>{out.push(n);n.children.forEach(visit);};visit(root);return out;};
 return {root,mounted,all,setUnsaved:value=>unsaved=value,setSession:value=>fn?.(value),find:text=>all().find(n=>n.tag==='button'&&n.textContent===text)};
}
test('panel requires explicit opt-in and shows saved target settings',async()=>{
 let calls=0;const f=panel(async(path,o)=>{calls++;return o.method==='GET'?response():Response.json({revision:3,enabled:true});});await new Promise(setImmediate);assert.equal(calls,1);assert.equal(f.find('Turn on').disabled,false);f.find('Turn on').onclick();await new Promise(setImmediate);assert.equal(calls,2);assert.ok(f.find('Turn off'));f.mounted.destroy();assert.equal(f.root.children.length,0);
});
test('paused enrolment keeps opt-in disabled but does not prevent opt-out',async()=>{
 const f=panel(async()=>response(),false);await new Promise(setImmediate);assert.equal(f.find('Turn on').disabled,true);f.mounted.destroy();
 const g=panel(async()=>response({...snapshot,stocks:[{...snapshot.stocks[0],emailEnabled:true}]}),false);await new Promise(setImmediate);assert.equal(g.find('Turn off').disabled,false);g.mounted.destroy();
});
test('sign-out clears email/code fields and account preferences',async()=>{
 const f=panel(async()=>response());await new Promise(setImmediate);const inputs=f.all().filter(n=>n.tag==='input');inputs[0].value='private@example.invalid';inputs[1].value='a'.repeat(64);f.setSession('guest');assert.deepEqual(inputs.map(n=>n.value),['','']);assert.ok(!f.find('Turn on'));f.mounted.destroy();
});

test('unsaved watchlist edits block consent mutation',async()=>{
 let calls=0;const f=panel(async()=>{calls++;return response();});await new Promise(setImmediate);f.setUnsaved(true);f.find('Turn on').onclick();await new Promise(setImmediate);assert.equal(calls,1);f.mounted.destroy();
});

test('paused verified subscriptions require an explicit resume click',async()=>{
 let puts=0;const f=panel(async(path,o)=>o.method==='GET'?response({...snapshot,stocks:[{...snapshot.stocks[0],emailEnabled:true}]}):(puts++,Response.json({revision:3,enabled:true})));await new Promise(setImmediate);assert.ok(f.find('Resume selected alerts'));assert.equal(puts,0);f.find('Resume selected alerts').onclick();await new Promise(setImmediate);assert.equal(puts,1);assert.equal(f.find('Resume selected alerts'),undefined);f.mounted.destroy();
});
