import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRefreshException,redactExceptionText} from '../src/simplicity-exception-log.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('retains diagnostic name/message/stack with a separate correlation id',()=>{
 const entries=[],error=new TypeError('Illegal invocation');error.stack='TypeError: Illegal invocation\n    at fetchSimplicityHistory (worker.js:20:7)';
 const actual=captureRefreshException(error,{stage:'download',seriesId:'simplicity:kiwisaver:high-growth',build:'a'.repeat(40),makeId:()=>id,logger:e=>entries.push(e)});
 assert.equal(actual,id);assert.equal(entries.length,1);assert.equal(entries[0].name,'TypeError');assert.equal(entries[0].message,'Illegal invocation');assert.match(entries[0].stack,/worker.js:20:7/);
});
test('redacts URL credentials/query, email, headers and token assignments',()=>{
 const text=redactExceptionText('TypeError: fetch failed https://user:PASSCANARY@example.invalid/api?token=QUERYCANARY\ncontact owner@example.invalid\nAuthorization: Bearer AUTHCANARY\nCookie: session=COOKIECANARY; other=OTHERCOOKIE\npassword=PASSCANARY secret=SECRETCANARY token=TOKENCANARY api_key=KEYCANARY');
 assert.match(text,/TypeError: fetch failed/);assert.match(text,/https:\/\/example.invalid\/api/);
 assert.doesNotMatch(text,/PASSCANARY|QUERYCANARY|owner@example|AUTHCANARY|COOKIECANARY|OTHERCOOKIE|SECRETCANARY|TOKENCANARY|KEYCANARY/);
});
test('bounds message/stack without serialising arbitrary thrown fields',()=>{
 const entries=[],error={name:'TypeError',message:'x'.repeat(10000),stack:'y'.repeat(20000),headers:{secret:'PRIVATE-CANARY'}};
 captureRefreshException(error,{stage:'persist',seriesId:'simplicity:investment:growth',makeId:()=>id,logger:e=>entries.push(e)});
 assert.equal(entries[0].message.length,2048);assert.equal(entries[0].stack.length,8192);assert.doesNotMatch(JSON.stringify(entries),/PRIVATE-CANARY|headers/);
});
test('logger and correlation-id failures never throw over the original failure',()=>{
 assert.equal(captureRefreshException(Error('original'),{makeId:()=>id,logger:()=>{throw Error('logger failed');}}),null);
 assert.equal(captureRefreshException(Error('original'),{makeId:()=>{throw Error('id failed');}}),null);
 assert.equal(captureRefreshException(Error('original'),{makeId:()=> 'not-a-uuid',logger:()=>{throw Error('must not log');}}),null);
});
test('hostile getters and primitive thrown values are handled safely',()=>{
 const entries=[],error={get name(){throw Error('secret');},get message(){throw Error('secret');},get stack(){throw Error('secret');}};
 assert.equal(captureRefreshException(error,{makeId:()=>id,logger:e=>entries.push(e)}),id);
 assert.equal(entries[0].name,'Error');assert.doesNotMatch(JSON.stringify(entries),/secret/);
 assert.equal(captureRefreshException('plain failure',{makeId:()=>id,logger:e=>entries.push(e)}),id);assert.equal(entries[1].message,'plain failure');
});
