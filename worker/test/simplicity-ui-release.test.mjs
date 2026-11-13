import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/account-app.mjs';
import {REQUEST,RUNTIME,APP,validateRequest,validateHealth,validateAlertSettings} from '../../scripts/simplicity-ui-release.mjs';
const health=()=>({ok:true,mode:'account-preview',build:RUNTIME,database:{bound:true,ready:true}});
const settings=()=>({bindings:[...['FRIENDS_ALERTS_ENABLED','FRIENDS_ENROLLMENT_ENABLED','FRIENDS_SCHEDULE_ENABLED'].map(name=>({name,type:'plain_text',text:'false'})),{name:'SIMPLICITY_READ_ONLY',type:'plain_text',text:'true'}]});
test('accepts only the exact reviewed retry request',()=>{assert.equal(REQUEST.attempt,2);assert.deepEqual(validateRequest({...REQUEST}),REQUEST);});
test('rejects altered pins, confirmation, missing attempt and extra fields',()=>{for(const field of Object.keys(REQUEST))assert.throws(()=>validateRequest({...REQUEST,[field]:'changed'}));const old={...REQUEST};delete old.attempt;assert.throws(()=>validateRequest(old));assert.throws(()=>validateRequest({...REQUEST,deployAnyway:true}));assert.throws(()=>validateRequest(null));});
test('real production health handler has no alert-capability fields',async()=>{
 const app=createApp({accounts:{enabled:true,allowedOrigin:APP,handle:async()=>new Response('unused')}});
 const env={BUILD_SHA:RUNTIME,DB:{prepare:sql=>({sql}),batch:async probes=>probes.map(()=>({success:true,results:[]}))}};
 const response=await app.fetch(new Request(APP+'/api/health'),env),h=await response.json();assert.equal(response.status,200);assert.equal(Object.hasOwn(h,'friendsAlerts'),false);validateHealth(h,RUNTIME);validateAlertSettings(settings());
});
test('rejects wrong builds, mode and unavailable database',()=>{const h=health();assert.throws(()=>validateHealth(h,'0'.repeat(40)));assert.throws(()=>validateHealth({...h,mode:'local-only-preview'},RUNTIME));assert.throws(()=>validateHealth({...h,database:{bound:true,ready:false}},RUNTIME));});
test('accepts explicit provider bindings with alerts off and fund reads on',()=>{validateAlertSettings(settings());});
test('rejects missing, duplicate, mistyped and enabled alert bindings',()=>{
 assert.throws(()=>validateAlertSettings({}));
 for(const name of settings().bindings.map(b=>b.name)){
  const absent=settings();absent.bindings=absent.bindings.filter(b=>b.name!==name);assert.throws(()=>validateAlertSettings(absent));
  const duplicate=settings();duplicate.bindings.push({...duplicate.bindings.find(b=>b.name===name)});assert.throws(()=>validateAlertSettings(duplicate));
  const changed=settings();changed.bindings.find(b=>b.name===name).text=name==='SIMPLICITY_READ_ONLY'?'false':'true';assert.throws(()=>validateAlertSettings(changed));
  const wrongType=settings();wrongType.bindings.find(b=>b.name===name).type='secret_text';assert.throws(()=>validateAlertSettings(wrongType));
 }
});
test('optional health alert capabilities must also be explicitly false if supplied',()=>{
 const flags={verificationReady:false,enrollmentAvailable:false,scheduledConfigured:false};validateHealth({...health(),friendsAlerts:flags},RUNTIME);
 assert.throws(()=>validateHealth({...health(),friendsAlerts:{}},RUNTIME));for(const key of Object.keys(flags))assert.throws(()=>validateHealth({...health(),friendsAlerts:{...flags,[key]:true}},RUNTIME));
});
