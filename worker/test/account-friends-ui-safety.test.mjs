import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailConsentClient,mountFriendsEmailSettings} from '../../site/account-friends-email.mjs';
const stock=(symbol,emailEnabled)=>({symbol,targetRevision:1,emailEnabled,alertsEnabled:emailEnabled});
const snapshot={revision:0,destination:{revision:1,verified:true,enabled:false},stocks:[stock('ABC',true),stock('DEF',true),stock('XYZ',false)]};
const response=value=>Response.json(value,{headers:{'X-Watchlist-Account':'u1'}});
test('client blocks enabling or resuming while another paused selection exists',async()=>{
 let puts=0;const client=createEmailConsentClient({fetcher:async(path,o)=>o.method==='GET'?response(snapshot):(puts++,Response.json({revision:1,enabled:true}))});
 await client.load();for(const symbol of ['ABC','DEF','XYZ'])assert.equal((await client.save(symbol,true)).kind,'paused-selection');assert.equal(puts,0);
});
test('paused selections can be removed, then each remaining stock resumes with its own revision write',async()=>{
 const writes=[];let revision=0;const client=createEmailConsentClient({fetcher:async(path,o)=>{if(o.method==='GET')return response(snapshot);const body=JSON.parse(o.body);writes.push(body);return Response.json({revision:++revision,enabled:body.enabled});}});
 await client.load();assert.equal((await client.save('DEF',false)).kind,'saved');assert.equal((await client.save('ABC',true)).kind,'saved');assert.equal((await client.save('XYZ',true)).kind,'saved');
 assert.deepEqual(writes.map(x=>[x.symbol,x.enabled,x.expectedWatchlistRevision]),[['DEF',false,0],['ABC',true,1],['XYZ',true,2]]);
});
class Node{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.value='';this.textContent='';this.attrs={};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attrs[k]=v;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
const tick=()=>new Promise(setImmediate);
function mount(fetcher){
 const doc={createElement:tag=>new Node(tag,doc)},root=new Node('main',doc);
 const ui=mountFriendsEmailSettings({root,fetcher,enrollmentAvailable:true,session:{subscribe(fn){fn('signed-in');return()=>{};},hasUnsaved:()=>false}});
 const all=()=>{const out=[];const visit=n=>{out.push(n);n.children.forEach(visit);};visit(root);return out;};
 return {ui,all,button:text=>all().find(n=>n.tag==='button'&&n.textContent===text)};
}
test('panel does not offer shared resume for multiple paused stocks and keeps opt-out usable',async()=>{
 const f=mount(async()=>response(snapshot));await tick();assert.equal(f.button('Resume selected alerts'),undefined);assert.equal(f.button('Turn on').disabled,true);assert.equal(f.button('Turn off').disabled,false);f.ui.destroy();
});
for(const action of ['Send verification code','Verify email'])test(action+' clears account data on an account-switch conflict without refreshing the new account',async()=>{
 const calls=[];const f=mount(async(path,o)=>{calls.push(path);if(path==='/api/v1/alert-consent/email')return response(snapshot);if(path==='/api/v1/watchlist')return response({});return Response.json({error:'Account changed'},{status:409});});
 await tick();const inputs=f.all().filter(n=>n.tag==='input');inputs[0].value='friend@example.invalid';inputs[1].value='a'.repeat(64);
 f.button(action).onclick();await tick();assert.deepEqual(inputs.map(n=>n.value),['','']);assert.equal(f.button('Refresh alert settings').disabled,true);assert.equal(f.button('Turn off'),undefined);assert.equal(calls.filter(x=>x==='/api/v1/alert-consent/email').length,1);assert.ok(f.all().some(n=>n.attrs.role==='status'&&n.textContent.includes('Account changed')));f.ui.destroy();
});
