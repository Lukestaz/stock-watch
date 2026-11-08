import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration,DB,APP,RELEASE} from '../../scripts/simplicity-production.mjs';
const settings=()=>({compatibility_date:'2026-10-19',bindings:[
 {type:'d1',name:'DB',id:DB},{type:'service',name:'PRICES',service:'stock-watch-prices'},
 {type:'ratelimit',name:'ACCOUNT_LIMIT',namespace_id:'1986667311',simple:{limit:30,period:60}},
 ...Object.entries({ACCOUNTS_ENABLED:'true',APP_ORIGIN:APP,GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',FRIENDS_ALERTS_ENABLED:'false',FRIENDS_ENROLLMENT_ENABLED:'false',FRIENDS_SCHEDULE_ENABLED:'false'}).map(([name,text])=>({type:'plain_text',name,text})),{type:'secret_text',name:'SYNTHETIC_SECRET'}]});
test('production configuration is fixed to approved Worker, DB and release',()=>{const c=configuration(settings());assert.equal(c.name,'stock-watch-app');assert.equal(c.d1_databases[0].database_id,DB);assert.equal(c.vars.BUILD_SHA,RELEASE);assert.equal(c.vars.SIMPLICITY_READ_ONLY,'true');assert.deepEqual(c.triggers.crons,[]);assert.equal('SYNTHETIC_SECRET' in c.vars,false);});
test('unexpected database cannot be deployed',()=>{const s=settings();s.bindings[0].id='another-db';assert.throws(()=>configuration(s));});
test('active friends alerts stop rather than silently disabling them',()=>{const s=settings();s.bindings.find(b=>b.name==='FRIENDS_ALERTS_ENABLED').text='true';assert.throws(()=>configuration(s));});
test('unrecognised bindings stop rather than being dropped',()=>{const s=settings();s.bindings.push({type:'r2_bucket',name:'OTHER'});assert.throws(()=>configuration(s));});
test('current public configuration is retained without copying secret values',()=>{const s=settings();s.bindings.push({type:'plain_text',name:'EXISTING_SETTING',text:'synthetic'});const c=configuration(s);assert.equal(c.vars.EXISTING_SETTING,'synthetic');assert.equal(c.vars.FRIENDS_ENROLLMENT_ENABLED,'false');});
