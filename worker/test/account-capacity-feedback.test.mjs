import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAlertConsentApi} from '../src/account-alert-consent-api.mjs';
import {createEmailConsentClient,mountFriendsEmailSettings} from '../../site/account-friends-email.mjs';
const origin='https://app.example.invalid';
const base={symbol:'ABC',enabled:true,expectedWatchlistRevision:2,expectedTargetRevision:1,expectedDestinationRevision:3};
const put=(over={})=>new Request(origin+'/v1/alert-consent/email',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','X-Watchlist-Account':'u1'},body:JSON.stringify({...base,...over})});
const api=store=>createAccountAlertConsentApi({enabled:true,enrollmentEnabled:true,allowedOrigin:origin,authenticate:async()=>({userId:'u1'}),admit:async()=>true,limit:async()=>true,store:{read:async()=>null,setEmailConsent:async()=>null,...store}});
const snapshot={revision:2,destination:{revision:3,verified:true,enabled:false},stocks:[{symbol:'ABC',targetRevision:1,emailEnabled:false,alertsEnabled:false}]};
const load=()=>Response.json(snapshot,{headers:{'X-Watchlist-Account':'u1'}});
const full=()=>Response.json({error:'x',code:'capacity-full'},{status:409});

test('capacity refusal gets a distinct code and exposes no counts or symbols',async()=>{
 let seen;const r=await api({emailConsentRefusal:async i=>(seen=i,'capacity')})(put());
 assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'Email alerts are at capacity',code:'capacity-full'});
 assert.equal(seen.userId,'u1');assert.equal(seen.symbol,'ABC');assert.equal(seen.enabled,true);
});
test('other refusals stay generic: stale, missing method, throwing method',async()=>{
 for(const store of [{emailConsentRefusal:async()=>'stale'},{},{emailConsentRefusal:async()=>{throw Error('x');}}]){
  const r=await api(store)(put()),j=await r.json();assert.equal(r.status,409);assert.equal(j.code,undefined);assert.match(j.error,/changed/);
 }
});
test('opt-outs and successful saves never ask for a refusal reason',async()=>{
 let calls=0;const refusal=async()=>(calls++,'capacity');
 assert.equal((await api({emailConsentRefusal:refusal})(put({enabled:false}))).status,409);
 assert.equal((await api({setEmailConsent:async()=>({revision:3,enabled:true}),emailConsentRefusal:refusal})(put())).status,200);assert.equal(calls,0);
});
test('client keeps its snapshot on capacity-full and does not retry',async()=>{
 let calls=0;const client=createEmailConsentClient({fetcher:async(p,o)=>(calls++,o.method==='GET'?load():full())});
 await client.load();assert.equal((await client.save('ABC',true)).kind,'capacity-full');
 assert.equal(client.view().revision,2);assert.equal(client.view().stocks[0].emailEnabled,false);assert.equal(calls,2);
});
test('a 409 with another code is still a conflict that clears the snapshot',async()=>{
 const client=createEmailConsentClient({fetcher:async(p,o)=>o.method==='GET'?load():Response.json({code:'other'},{status:409})});
 await client.load();assert.equal((await client.save('ABC',true)).kind,'conflict');assert.equal(client.view(),null);
});
class Node{constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.textContent='';this.value='';this.attrs={};}
 append(...n){for(const x of n){x.parent=this;this.children.push(x);}}replaceChildren(...n){this.children=[];this.append(...n);}
 setAttribute(k,v){this.attrs[k]=v;}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
function panel(fetcher){const doc={createElement:tag=>new Node(tag,doc)},root=new Node('main',doc);
 const session={subscribe:f=>{f('signed-in');return()=>{};},hasUnsaved:()=>false};
 const mounted=mountFriendsEmailSettings({root,session,enrollmentAvailable:true,fetcher});
 const all=()=>{const out=[];const visit=n=>{out.push(n);n.children.forEach(visit);};visit(root);return out;};
 return {mounted,all,find:text=>all().find(n=>n.tag==='button'&&n.textContent===text)};}
test('panel shows the capacity message and leaves Turn on available',async()=>{
 const f=panel(async(p,o)=>o.method==='GET'?load():full());await new Promise(setImmediate);
 f.find('Turn on').onclick();await new Promise(setImmediate);
 const status=f.all().find(n=>n.attrs.role==='status');
 assert.match(status.textContent,/at capacity/);assert.doesNotMatch(status.textContent,/Refresh before saving/);
 assert.equal(f.find('Turn on').disabled,false);f.mounted.destroy();
});
