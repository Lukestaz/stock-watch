import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRefreshFailure} from '../src/simplicity-route.mjs';
test('upstream status is categorised without raw provider text',()=>assert.deepEqual(classifyRefreshFailure(Error('Feed HTTP 403'),'download'),{stage:'download',category:'upstream-http',httpStatus:403}));
test('timeout, content and parsing categories are bounded',()=>{
 assert.equal(classifyRefreshFailure({name:'AbortError'},'download').category,'upstream-timeout');
 assert.equal(classifyRefreshFailure(Error('Unexpected response type'),'download').category,'upstream-content-type');
 assert.equal(classifyRefreshFailure(Error('Unexpected CSV header'),'download').category,'csv-invalid');
});
test('storage and validation failures never expose messages',()=>{
 const secret=Error('PRIVATE-CANARY user@example.invalid SQL token');
 assert.deepEqual(classifyRefreshFailure(secret,'persist'),{stage:'persist',category:'storage-failure'});
 assert.deepEqual(classifyRefreshFailure(secret,'validate'),{stage:'validate',category:'snapshot-invalid'});
 assert.doesNotMatch(JSON.stringify(classifyRefreshFailure(secret,'download')),/PRIVATE-CANARY|SQL|token|example/);
});
test('future dates remain rejected and no arbitrary stage is exposed',()=>{
 assert.equal(classifyRefreshFailure(Error('Future-dated feed'),'validate').category,'future-dated-feed');
 assert.deepEqual(classifyRefreshFailure(Error('secret'),'secret-stage'),{stage:'unknown',category:'unexpected-failure'});
});
