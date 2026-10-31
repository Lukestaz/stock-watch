import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAlertDestinationRoutes} from '../src/account-alert-destinations.mjs';
globalThis.crypto ??= webcrypto;
test('account precondition rejects another session before limiter, storage or mail',async()=>{
 let calls=0;const route=createAlertDestinationRoutes({enabled:true,allowedOrigin:'https://app.example.invalid',authenticate:async()=>({userId:'u2'}),limit:async()=>{calls++;return true;},store:{beginEmailVerification:async()=>{calls++;return true;},completeEmailVerification:async()=>{calls++;return true;}},sendVerification:async()=>{calls++;return true;}});
 const r=await route(new Request('https://app.example.invalid/v1/alert-destination/email',{method:'POST',headers:{Origin:'https://app.example.invalid','Content-Type':'application/json','X-Watchlist-Account':'u1'},body:JSON.stringify({address:'a@example.invalid'})}));
 assert.equal(r.status,409);assert.equal(calls,0);
});
