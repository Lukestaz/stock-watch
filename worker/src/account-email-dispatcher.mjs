// Candidate price-alert formatter and dispatcher. Never imported by production.
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function formatAccountPriceAlert(value){
 const money=n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<1e-8||n>1e9)throw Error('Invalid price');return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});};
 if(typeof value?.symbol!=='string'||!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(value.symbol)||!['near','target'].includes(value.kind)||!Number.isSafeInteger(value.observedAt)||value.observedAt<=0)throw Error('Invalid alert');
 if(value.kind==='target'?value.low>value.target:!(value.low>value.target&&value.low<=value.target*1.05))throw Error('Invalid threshold event');
 const target=money(value.target),low=money(value.low),time=new Date(value.observedAt*1000).toISOString();
 return {subject:'[Stock Watch] Price alert',text:`Stock Watch | ${value.symbol} - ${value.kind==='target'?'target reached':'near target'}\nObserved low: ${low}\nYour target: ${target}\nObserved: ${time} (UTC)\nhttps://stock-watch-app.lukestaz.workers.dev/\n\nDelayed market data, not a live or executable quote. Check your broker before acting. Not an automatic buy instruction.\n`};
}
export function createAccountEmailDispatcher({enabled=false,outbox,reserve,send,from,clock=()=>Math.floor(Date.now()/1000)}={}){
 const ready=enabled===true&&['claim','start','defer','finish'].every(k=>typeof outbox?.[k]==='function')&&typeof reserve==='function'&&typeof send==='function'&&typeof from==='string'&&from.includes('@')&&typeof clock==='function';
 return {async run({limit=10}={}){
  const counts={accepted:0,deferred:0,skipped:0,failed:0,uncertain:0};if(!ready)return counts;
  if(!Number.isInteger(limit)||limit<1||limit>25)throw Error('Invalid dispatch batch');
  for(let i=0;i<limit;i++){
   const claim=await outbox.claim(clock());if(!claim)break;
   let allowed=false;try{allowed=await reserve({userId:claim.userId,destinationHash:await hash(claim.recipient.toLowerCase()),now:clock()})===true;}catch{}
   if(!allowed){await outbox.defer(claim.claimToken,clock());counts.deferred++;continue;}
   const value=await outbox.start(claim.claimToken,clock());if(!value){counts.skipped++;continue;}
   let outcome='not_sent',message;
   try{message=formatAccountPriceAlert(value);}catch{}
   if(message){try{const result=await send({from,to:value.recipient,...message});outcome=['accepted','not_sent','failed','outcome_unknown'].includes(result?.outcome)?result.outcome:'outcome_unknown';}catch{outcome='outcome_unknown';}}
   const recorded=await outbox.finish({claimToken:value.claimToken,dispatchToken:value.dispatchToken,outcome,now:clock()});
   if(!recorded||outcome==='outcome_unknown')counts.uncertain++;else if(outcome==='accepted')counts.accepted++;else counts.failed++;
  }return counts;
 }};
}
