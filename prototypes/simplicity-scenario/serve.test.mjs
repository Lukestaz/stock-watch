import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {request} from 'node:http';import {createPrototypeServer} from './serve.mjs';
let server,port;
before(async()=>{server=createPrototypeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));});
function get(path,method='GET',host=`127.0.0.1:${port}`){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,method,headers:{Host:host}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});}
for(const path of ['/','/prototypes/simplicity-scenario/engine.mjs','/prototypes/simplicity-scenario/ui.mjs','/worker/src/simplicity-catalogue.mjs'])test('serve whitelist '+path,async()=>{const r=await get(path);assert.equal(r.status,200);assert.ok(r.body);assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['content-security-policy'],/connect-src 'none'/);});
for(const [path,method,host,status] of [['/README.md','GET',null,404],['/../README.md','GET',null,404],['/','POST',null,404],['/','GET','evil.example',403]])test('reject '+path+' '+method+' '+host,async()=>assert.equal((await get(path,method,host??`127.0.0.1:${port}`)).status,status));
