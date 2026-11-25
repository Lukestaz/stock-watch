import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=new URL('../../',import.meta.url);
const paths=new Set(['/worker/src/simplicity-catalogue.mjs',...['index.html','engine.mjs','ui.mjs'].map(x=>'/prototypes/simplicity-scenario/'+x)]);
export function createPrototypeServer(){
 const server=createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403).end();return;}
  const path=req.url==='/'?'/prototypes/simplicity-scenario/index.html':req.url;
  if(req.method!=='GET'||!paths.has(path)){res.writeHead(404).end();return;}
  try{const content=await readFile(new URL(path.slice(1),root));res.writeHead(200,{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(content);}catch{res.writeHead(500).end();}
 });return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createPrototypeServer().listen(4174,'127.0.0.1',()=>console.log('Local prototype http://127.0.0.1:4174'));
