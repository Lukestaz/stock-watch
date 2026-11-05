// Fixed-purpose adapter only. Transport and production wiring are not supplied.
function address(value){
 if(typeof value!=='string'||value.length>254||value!==value.trim())return null;
 const parts=value.split('@');
 if(parts.length!==2||!parts[0]||parts[0].length>64||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..')||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]))return null;
 const labels=parts[1].split('.');
 if(labels.length<2||labels.some(label=>!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)))return null;
 return parts[0]+'@'+parts[1].toLowerCase();
}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function createVerificationMailer({enabled=false,from,send,reserve,clock=()=>Math.floor(Date.now()/1000)}={}){
 const sender=address(from),ready=enabled===true&&sender!==null&&typeof send==='function'&&typeof reserve==='function'&&typeof clock==='function';
 return async ({userId,to,token,expiresAt}={})=>{
  if(!ready)return false;
  try{
   const recipient=address(to),now=clock();
   if(typeof userId!=='string'||!userId||userId.length>256||recipient===null||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+600)return false;
   const message={from:sender,to:recipient,subject:'[Stock Watch] Verify your email address',text:`Stock Watch email verification\n\nYour verification code:\n${token}\n\nExpires at: ${new Date(expiresAt*1000).toISOString()}\n\nEnter this code in the signed-in Stock Watch app.\nThis verifies your email address only. It does not enable stock alerts.\nIf you did not request this, ignore this message.\n`};
   const destinationHash=await digest(recipient.toLowerCase());
   if(await reserve({userId,destinationHash,now})!==true)return false;
   const result=await send(message);
   return result?.outcome==='accepted';
  }catch{return false;}
 };
}
