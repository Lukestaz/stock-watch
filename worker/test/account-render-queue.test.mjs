import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLatestLoader} from '../../site/load-queue.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('account change during read discards previous data and drains latest request',async()=>{
 const first=deferred(),second=deferred(),started=deferred();let calls=0;const rendered=[];
 const load=createLatestLoader({read:()=>{calls++;if(calls===1){started.resolve();return first.promise;}return second.promise;},commit:value=>rendered.push(value)});
 const done=load();await started.promise;load();load();first.resolve('private account A');
 await Promise.resolve();await Promise.resolve();assert.deepEqual(rendered,[]);
 second.resolve('account B');await done;assert.equal(calls,2);assert.deepEqual(rendered,['account B']);
});
test('unchanged data renders again after external card clearing',async()=>{
 const data={stocks:['ABC']};let cards=[];
 const load=createLatestLoader({read:async()=>data,commit:value=>{cards=[...value.stocks];}});
 await load();cards=[];await load();assert.deepEqual(cards,['ABC']);
});
test('superseded error cannot replace latest account view',async()=>{
 const first=deferred(),started=deferred(),errors=[],rendered=[];let calls=0;
 const load=createLatestLoader({read:()=>{if(++calls===1){started.resolve();return first.promise;}return Promise.resolve('guest');},commit:value=>rendered.push(value),failed:error=>errors.push(error.message)});
 const done=load();await started.promise;load();first.reject(Error('old account failed'));await done;
 assert.deepEqual(errors,[]);assert.deepEqual(rendered,['guest']);
});
test('current failure reports once and a later refresh recovers',async()=>{
 let fail=true;const errors=[],rendered=[];
 const load=createLatestLoader({read:async()=>{if(fail)throw Error('current failure');return 'recovered';},commit:value=>rendered.push(value),failed:error=>errors.push(error.message)});
 await load();fail=false;await load();assert.deepEqual(errors,['current failure']);assert.deepEqual(rendered,['recovered']);
});
test('refresh queued from a render microtask is not lost at drain completion',async()=>{
 let calls=0;const rendered=[];let load;
 load=createLatestLoader({read:async()=>++calls,commit:value=>{rendered.push(value);if(value===1)queueMicrotask(()=>load());}});
 await load();assert.deepEqual(rendered,[1,2]);
});
