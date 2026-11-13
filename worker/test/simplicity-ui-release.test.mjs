import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUEST,RUNTIME,validateRequest,validateHealth} from '../../scripts/simplicity-ui-release.mjs';
const health=()=>({ok:true,mode:'account-preview',build:RUNTIME,database:{bound:true,ready:true},friendsAlerts:{verificationReady:false,enrollmentAvailable:false,scheduledConfigured:false}});
test('accepts only the exact reviewed release request',()=>{assert.deepEqual(validateRequest({...REQUEST}),REQUEST);});
test('rejects altered pins, confirmation and extra fields',()=>{for(const field of Object.keys(REQUEST))assert.throws(()=>validateRequest({...REQUEST,[field]:'changed'}));assert.throws(()=>validateRequest({...REQUEST,deployAnyway:true}));assert.throws(()=>validateRequest(null));});
test('accepts healthy expected build with all alert flags false',()=>{validateHealth(health(),RUNTIME);});
test('rejects wrong builds, unavailable database and unknown alert state',()=>{const h=health();assert.throws(()=>validateHealth(h,'0'.repeat(40)));assert.throws(()=>validateHealth({...h,database:{bound:true,ready:false}},RUNTIME));assert.throws(()=>validateHealth({...h,friendsAlerts:{}},RUNTIME));});
test('rejects every enabled alert flag',()=>{for(const flag of Object.keys(health().friendsAlerts)){const h=health();h.friendsAlerts[flag]=true;assert.throws(()=>validateHealth(h,RUNTIME));}});
