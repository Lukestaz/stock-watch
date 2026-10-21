import test from 'node:test';
import assert from 'node:assert/strict';
import {bindAccountWatchlist} from '../../site/account-binding.mjs';
import {createSessionState} from '../../site/account-session.mjs';
function fixture(initial='checking') {
 const session=createSessionState();session.set(initial);
 const events=[],snapshots=[];let notify,loads=0,disconnects=0;
 const binding=bindAccountWatchlist({session,transition:s=>events.push(s),changed:s=>snapshots.push(s),createSync:({changed})=>{
 notify=changed;return {disconnect(){disconnects++;changed({status:'guest'});},async load(){loads++;changed({status:'loading'});changed({status:'saved',account:'a',stocks:[]});}};
 }});
 return {session,events,snapshots,binding,notify:s=>notify(s),loads:()=>loads,disconnects:()=>disconnects};
}
test('initial signed-in binding does not interpret reset as sign-out',()=>{
 const f=fixture('signed-in');assert.equal(f.session.get(),'signed-in');assert.deepEqual(f.events,['signed-in']);assert.equal(f.loads(),1);assert.equal(f.disconnects(),1);assert.equal(f.snapshots.at(-1).status,'saved');
});
test('checking then signed-in keeps account mode and loads exactly once',()=>{
 const f=fixture();f.session.set('signed-in');assert.equal(f.session.get(),'signed-in');assert.deepEqual(f.events,['checking','signed-in']);assert.equal(f.loads(),1);
});
test('real unauthorized guest notification restores guest once without recursion',()=>{
 const f=fixture('signed-in');f.notify({status:'guest'});assert.equal(f.session.get(),'guest');assert.deepEqual(f.events,['signed-in','guest']);assert.equal(f.loads(),1);assert.equal(f.disconnects(),2);
});
test('logout then login starts a new load without replaying old guest events',()=>{
 const f=fixture('signed-in');f.session.set('checking');f.session.set('guest');f.session.set('checking');f.session.set('signed-in');assert.equal(f.session.get(),'signed-in');assert.equal(f.loads(),2);assert.deepEqual(f.events,['signed-in','checking','guest','checking','signed-in']);
});
test('unsubscribing stops transitions and loads',()=>{
 const f=fixture();f.binding.stop();f.session.set('signed-in');assert.equal(f.loads(),0);assert.deepEqual(f.events,['checking']);
});
