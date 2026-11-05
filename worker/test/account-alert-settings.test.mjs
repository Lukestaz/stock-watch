import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerificationClient,mountEmailVerificationPanel} from '../../site/account-alert-settings.mjs';
const account=(id='u1')=>new Response('{}',{status:200,headers:{'X-Watchlist-Account':id}});
test('module and default-disabled preview do not mount or fetch',()=>{
 let calls=0;mountEmailVerificationPanel({fetcher:()=>calls++}).destroy();assert.equal(calls,0);
});
test('registration preflights real account header and sends only the address',async()=>{
 const calls=[];const client=createVerificationClient({fetcher:async(path,options)=>{calls.push({path,options});return calls.length===1?account():Response.json({ok:true},{status:202});}});
 assert.deepEqual(await client.register('friend@example.invalid'),{kind:'sent'});assert.equal(calls.length,2);
 assert.equal(calls[0].path,'/api/v1/watchlist');assert.equal(calls[1].options.headers['X-Watchlist-Account'],'u1');assert.deepEqual(JSON.parse(calls[1].options.body),{address:'friend@example.invalid'});
 assert.equal(calls[1].options.credentials,'same-origin');assert.equal(calls[1].options.redirect,'error');assert.equal(calls[1].options.cache,'no-store');
});
test('verification posts code only in JSON and requires alerts to remain off',async()=>{
 const token='a'.repeat(64),calls=[];const client=createVerificationClient({fetcher:async(path,options)=>{calls.push({path,options});return calls.length===1?account():Response.json({verified:true,alertsEnabled:false});}});
 assert.deepEqual(await client.verify(token),{kind:'verified'});assert.ok(!calls[1].path.includes(token));assert.deepEqual(JSON.parse(calls[1].options.body),{token});
});
test('missing account identity or expired session never posts',async()=>{
 for(const response of [new Response('{}'),new Response('{}',{status:401})]){
  let calls=0;const client=createVerificationClient({fetcher:async()=>{calls++;return response;}});assert.ok(['unavailable','signed-out'].includes((await client.register('a@example.invalid')).kind));assert.equal(calls,1);
 }
});
test('account conflict and rate-limit results are generic',async()=>{
 for(const [status,kind] of [[409,'account-changed'],[429,'rate-limited'],[503,'unavailable']]){
  let count=0;const client=createVerificationClient({fetcher:async()=>++count===1?account():Response.json({error:'private raw detail'},{status})});assert.deepEqual(await client.register('a@example.invalid'),{kind});
 }
});
test('session reset discards stale responses and aborts pending fetch',async()=>{
 let resolve,signal;const client=createVerificationClient({fetcher:async(path,options)=>{signal=options.signal;return new Promise(r=>resolve=r);}});
 const pending=client.register('a@example.invalid');await Promise.resolve();client.reset();resolve(account());assert.deepEqual(await pending,{kind:'stale'});assert.equal(signal.aborted,true);
});
test('invalid code and injection fail before network',async()=>{
 let calls=0;const client=createVerificationClient({fetcher:()=>calls++});assert.deepEqual(await client.verify('bad'),{kind:'invalid'});assert.deepEqual(await client.register('a\r\nBcc:b@example.invalid'),{kind:'invalid'});assert.equal(calls,0);
});

class FakeNode{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.value='';this.textContent='';this.attributes={};}
 setAttribute(key,value){this.attributes[key]=value;}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
}
function panelFixture(fetcher){
 const doc={createElement:tag=>new FakeNode(tag,doc)},root=new FakeNode('main',doc);let listener;
 const session={subscribe(fn){listener=fn;fn('signed-in');return()=>listener=null;}};
 const mounted=mountEmailVerificationPanel({root,session,enabled:true,fetcher}),panel=root.children[0];
 return {root,panel,mounted,setSession:value=>listener?.(value),button:text=>panel.children.find(node=>node.tag==='button'&&node.textContent===text),fields:panel.children.filter(node=>node.tag==='label').map(node=>node.children[0]),status:panel.children.find(node=>node.attributes.role==='status')};
}
test('explicit preview mount does not fetch and leaves alert controls unavailable',()=>{
 let calls=0;const f=panelFixture(()=>calls++);assert.equal(calls,0);assert.equal(f.button('Email price alerts — not available yet').disabled,true);assert.equal(f.button('WhatsApp alerts — not available yet').disabled,true);f.mounted.destroy();assert.equal(f.root.children.length,0);
});
test('preview button performs only explicit registration and reports the result',async()=>{
 let calls=0;const f=panelFixture(async()=>++calls===1?account():Response.json({ok:true},{status:202}));f.fields[0].value='friend@example.invalid';f.button('Send verification code').onclick();await new Promise(setImmediate);assert.equal(calls,2);assert.ok(f.status.textContent.includes('Only the latest code'));f.mounted.destroy();
});
test('session changes clear sensitive fields and discard a pending preview result',async()=>{
 let resolve,calls=0;const f=panelFixture(async()=>{calls++;return new Promise(r=>resolve=r);});f.fields[0].value='friend@example.invalid';f.fields[1].value='a'.repeat(64);f.button('Send verification code').onclick();await Promise.resolve();f.setSession('guest');resolve(account());await new Promise(setImmediate);assert.equal(calls,1);assert.deepEqual(f.fields.map(node=>node.value),['','']);assert.equal(f.button('Send verification code').disabled,true);assert.equal(f.status.textContent,'Sign in to verify your email.');f.mounted.destroy();
});
