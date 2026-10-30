// Narrow Gmail submission transport. Never opens a socket unless explicitly enabled.
const encoder=new TextEncoder();
const mailbox=v=>typeof v==='string'&&v.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(v)&&!v.includes('..');
const base64=text=>{const bytes=encoder.encode(text);let out='';for(const b of bytes)out+=String.fromCharCode(b);return btoa(out);};
class Rejected extends Error{}
export function createGmailSmtpTransport({enabled=false,connect,username,appPassword,timeoutMs=15000}={}){
 const password=typeof appPassword==='string'?appPassword.replaceAll(' ',''):'';
 const configured=enabled===true&&typeof connect==='function'&&mailbox(username)&&/^[A-Za-z]{16}$/.test(password)&&Number.isInteger(timeoutMs)&&timeoutMs>=10&&timeoutMs<=30000;
 return {configured,async send(message){
  if(!configured)return {outcome:'not_sent',category:'missing_configuration'};
  if(!message||message.from!==username||!mailbox(message.to)||message.subject!=='[Stock Watch] Verify your email address'||typeof message.text!=='string'||encoder.encode(message.text).length>8192)return {outcome:'not_sent',category:'invalid_message'};
  let socket,reader,writer,timer,submitted=false,timedOut=false;
  const close=()=>{try{Promise.resolve(socket?.close()).catch(()=>{});}catch{}};
  const guard=()=>{if(timedOut)throw Error();};
  try{
   const run=async()=>{
    socket=connect({hostname:'smtp.gmail.com',port:465},{secureTransport:'on',allowHalfOpen:false});
    Promise.resolve(socket.closed).catch(()=>{});await socket.opened;guard();
    reader=socket.readable.getReader();writer=socket.writable.getWriter();
    let buffer='';const decoder=new TextDecoder();
    const line=async()=>{
     for(;;){guard();const end=buffer.indexOf('\r\n');if(end>=0){if(end>2048)throw Error();const value=buffer.slice(0,end);buffer=buffer.slice(end+2);return value;}
      if(buffer.length>2048)throw Error();const part=await reader.read();guard();if(part.done)throw Error();buffer+=decoder.decode(part.value,{stream:true});if(buffer.length>16384)throw Error();}
    };
    const reply=async()=>{
     let code=null;const text=[];
     for(let i=0;i<50;i++){const match=/^([2-5][0-9]{2})([- ])([^\r\n]*)$/.exec(await line());if(!match||(code!==null&&code!==Number(match[1])))throw Error();code=Number(match[1]);text.push(match[3]);if(match[2]===' ')return {code,text};}
     throw Error();
    };
    const expect=(response,allowed)=>{if(!allowed.includes(response.code))throw new Rejected();return response;};
    const write=async text=>{guard();await writer.write(encoder.encode(text));guard();};
    const command=async(text,allowed)=>{await write(text+'\r\n');return expect(await reply(),allowed);};
    expect(await reply(),[220]);
    const hello=await command('EHLO stock-watch.invalid',[250]);
    if(!hello.text.some(text=>/^AUTH(?:=|\s+).*\bPLAIN\b/i.test(text)))throw new Rejected();
    await command('AUTH PLAIN '+base64('\0'+username+'\0'+password),[235]);
    await command('MAIL FROM:<'+username+'>',[250]);
    await command('RCPT TO:<'+message.to+'>',[250,251]);
    await command('DATA',[354]);
    const body=base64(message.text).match(/.{1,76}/g)?.join('\r\n')||'';
    const wire=['From: '+username,'To: '+message.to,'Subject: '+message.subject,'Date: '+new Date().toUTCString(),'Message-ID: <'+crypto.randomUUID()+'@stock-watch.invalid>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''].join('\r\n')+body+'\r\n.\r\n';
    guard();submitted=true;await write(wire);expect(await reply(),[250]);
    return {outcome:'accepted',category:null};
   };
   return await Promise.race([run(),new Promise((resolve,reject)=>{timer=setTimeout(()=>{timedOut=true;close();reject(Error());},timeoutMs);})]);
  }catch(error){
   return {outcome:error instanceof Rejected?(submitted?'failed':'not_sent'):(submitted?'outcome_unknown':'not_sent'),category:timedOut?'smtp_timeout':error instanceof Rejected?'smtp_rejected':'smtp_transport_error'};
  }finally{
   clearTimeout(timer);close();try{reader?.releaseLock();}catch{}try{writer?.releaseLock();}catch{}
  }
 }};
}
