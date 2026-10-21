const encoder=new TextEncoder();
export const SESSION_COOKIE='__Host-sw-session';
export const CHALLENGE_COOKIE='__Host-sw-login';
const DAY=86400;
export const SESSION_TTL=30*DAY;
export const IDLE_TTL=7*DAY;
const token=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export async function tokenHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function cookie(name,value,maxAge){
 if(![SESSION_COOKIE,CHALLENGE_COOKIE].includes(name)||(!validToken(value)&&value!=='')||!Number.isInteger(maxAge)||maxAge<0)throw Error('Invalid cookie');
 return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
}
export function readSessionCookie(request){
 if(new URL(request.url).protocol!=='https:')return null;
 const matches=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(SESSION_COOKIE+'='));
 if(matches.length!==1)return null;
 const value=matches[0].slice(SESSION_COOKIE.length+1);return validToken(value)?value:null;
}
function decode(part){
 if(!/^[A-Za-z0-9_-]+$/.test(part))throw Error('Invalid identity');
 return Uint8Array.from(atob(part.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(part.length/4)*4,'=')),c=>c.charCodeAt(0));
}
export async function verifyGoogleIdToken(jwt,{clientId,nonce,keys,now=Math.floor(Date.now()/1000)}={}){
 try{
  if(typeof clientId!=='string'||!clientId||typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)||typeof jwt!=='string'||jwt.length>16384||!Number.isSafeInteger(now))throw Error();
  const parts=jwt.split('.');if(parts.length!==3)throw Error();
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[0])));
  const claims=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.kid.length>200||header.crit!==undefined||header.jku!==undefined||header.x5u!==undefined)throw Error();
  if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||(claims.azp!==undefined&&claims.azp!==clientId)||claims.nonce!==nonce||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)throw Error();
  if(!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.iat)||claims.exp<=now||claims.iat>now+60||claims.exp<=claims.iat||claims.exp-claims.iat>7200||(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now)))throw Error();
  const matches=keys?.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(k.use===undefined||k.use==='sig')&&(k.alg===undefined||k.alg==='RS256'));
  if(matches?.length!==1)throw Error();
  const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(key.algorithm.modulusLength<2048||!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error();
  return {googleSub:claims.sub};
 }catch{throw Error('Invalid identity');}
}
// Keys must come from a trusted server-side Google JWKS loader, never request data.
// This module adds no HTTP routes and is not imported by the public Worker.
export function createIdentityService({db,clientId,loadGoogleKeys,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(typeof db?.batch!=='function'||typeof db?.prepare!=='function'||!clientId||typeof loadGoogleKeys!=='function')throw Error('Identity configuration required');
 const stmt=(sql,args)=>db.prepare(sql).bind(...args);
 const batch=async statements=>{const r=await db.batch(statements);if(r.length!==statements.length||r.some(s=>s.success!==true))throw Error('Identity storage unavailable');return r;};
 return {
  async beginLogin(){
   const challenge=token(),hash=await tokenHash(challenge),now=clock();
   await batch([stmt('INSERT INTO login_challenges(challenge_hash,created_at,expires_at) VALUES (?,?,?)',[hash,now,now+600])]);
   return {challenge,nonce:hash,setCookie:cookie(CHALLENGE_COOKIE,challenge,600)};
  },
  async completeLogin({challenge,idToken}){
   if(!validToken(challenge))throw Error('Invalid login challenge');
   const challengeHash=await tokenHash(challenge),keys=await loadGoogleKeys(),now=clock();
   const {googleSub}=await verifyGoogleIdToken(idToken,{clientId,nonce:challengeHash,keys,now});
   const session=token(),sessionHash=await tokenHash(session),userId=crypto.randomUUID();
   const guard='EXISTS (SELECT 1 FROM login_challenges WHERE challenge_hash=? AND used_by=?)';
   const r=await batch([
    stmt('UPDATE login_challenges SET used_by=? WHERE challenge_hash=? AND used_by IS NULL AND expires_at>? RETURNING challenge_hash',[sessionHash,challengeHash,now]),
    stmt('INSERT INTO users(id,google_sub) SELECT ?,? WHERE '+guard+' ON CONFLICT(google_sub) DO NOTHING',[userId,googleSub,challengeHash,sessionHash]),
    stmt('INSERT INTO watchlists(user_id) SELECT id FROM users WHERE google_sub=? AND '+guard+' ON CONFLICT(user_id) DO NOTHING',[googleSub,challengeHash,sessionHash]),
    stmt('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at,expires_at) SELECT ?,id,?,?,? FROM users WHERE google_sub=? AND '+guard,[sessionHash,now,now,now+SESSION_TTL,googleSub,challengeHash,sessionHash]),
    stmt('SELECT user_id FROM sessions WHERE token_hash=?',[sessionHash])
   ]);
   if(!r[0].results.length||!r[4].results.length)throw Error('Invalid login challenge');
   return {userId:r[4].results[0].user_id,setCookie:cookie(SESSION_COOKIE,session,SESSION_TTL),clearChallenge:cookie(CHALLENGE_COOKIE,'',0)};
  },
  async authenticate(request){
   const raw=readSessionCookie(request);if(!raw)return null;
   const now=clock(),hash=await tokenHash(raw);
   const r=await batch([stmt('UPDATE sessions SET last_seen_at=? WHERE token_hash=? AND expires_at>? AND last_seen_at>? RETURNING user_id',[now,hash,now,now-IDLE_TTL])]);
   return r[0].results.length?{userId:r[0].results[0].user_id}:null;
  },
  async logout(request){
   const raw=readSessionCookie(request);
   if(raw)await batch([stmt('DELETE FROM sessions WHERE token_hash=?',[await tokenHash(raw)])]);
   return {setCookie:cookie(SESSION_COOKIE,'',0)};
  }
 };
}
