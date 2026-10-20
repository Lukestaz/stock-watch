const ENDPOINT='https://stock-watch-prices.lukestaz.workers.dev';
const fetchPrice=window.fetch.bind(window),states=new Map();let forced=false;
const notice=document.createElement('p');notice.id='price-refresh-status';notice.setAttribute('role','status');notice.textContent='Loading prices…';document.querySelector('header').after(notice);
const style=document.createElement('style');style.textContent='#price-refresh-status{font-size:.78rem;line-height:1.4;color:#b5c4da;margin:4px 0 12px;min-height:1.4em}.market-data-warning{font-size:.8rem;color:#ffca9b;line-height:1.4}';document.head.append(style);
document.querySelector('#refresh').addEventListener('click',e=>{if(e.isTrusted)forced=true;},true);
export const priceState=symbol=>states.get(symbol);
function nyDay(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
function cleanHistory(rows,cutoff){const day=nyDay();return [...new Map((Array.isArray(rows)?rows:[]).filter(b=>b&&typeof b.t==='string'&&Number.isFinite(Date.parse(b.t))&&Date.parse(b.t)<=cutoff&&b.t.slice(0,10)<day&&['c','l'].every(k=>Number.isFinite(b[k])&&b[k]>0)).map(b=>[b.t,{t:b.t,c:b.c,l:b.l}])).values()].sort((a,b)=>a.t.localeCompare(b.t));}
function validate(data,symbol){
 const fetched=Date.parse(data?.fetchedAt),cutoff=Date.parse(data?.dataCutoff);
 if(data?.symbol!==symbol||!Number.isFinite(fetched)||!Number.isFinite(cutoff)||fetched>Date.now()+60000||cutoff>fetched-15*60000)throw Error('Invalid price-service response');
 const historyCutoff=Date.parse(data.historyDataCutoff||data.dataCutoff),historyChecked=Date.parse(data.cache?.history?.checkedAt||data.fetchedAt);
 if(!Number.isFinite(historyCutoff)||!Number.isFinite(historyChecked)||historyChecked>Date.now()+60000||historyCutoff>historyChecked-15*60000)throw Error('Invalid history timestamp');
 const history=cleanHistory(data.history,historyCutoff),time=Date.parse(data.time),hasPrice=Number.isFinite(data.price)&&data.price>0&&Number.isFinite(time)&&time<=cutoff;
 if(!history.length&&!hasPrice)throw Error('No validated completed history or price available');
 const warnings=[];
 for(const [kind,label] of [['history','Chart history'],['latest','Latest price']]){
  const part=data.cache?.[kind];if(!part)continue;
  if(!['fresh','stale','unavailable'].includes(part.state))throw Error('Invalid cache status');
  if(part.state==='unavailable')warnings.push(label+' unavailable');
  if(part.state==='stale'){
   const stamp=Date.parse(part.checkedAt);if(!Number.isFinite(stamp))throw Error('Invalid cache timestamp');
   warnings.push(label+' stale; last fetched '+new Date(stamp).toLocaleString('en-NZ'));
  }
 }
 return {history,fetchedAt:data.fetchedAt,dataCutoff:data.dataCutoff,cacheWarning:warnings.join(' · '),...(hasPrice?{price:data.price,time:data.time}:{})};
}
function signature(data){return JSON.stringify([data?.price,data?.time,data?.history?.length,data?.history?.at(-1)]);}
function merge(stock,data,error){const oldHistory=cleanHistory(stock.history,Date.now()),history=data?.history?.length&&(!oldHistory.length||data.history.at(-1).t>=oldHistory.at(-1).t)?data.history:oldHistory;const newer=data?.time&&(!stock.time||Date.parse(data.time)>=Date.parse(stock.time));return {...stock,history,...(newer?{price:data.price,time:data.time}:{}),status:error?'Price lookup failed; retained older data':data?.cacheWarning?'Cached or partial market data; see timestamps':'delayed SIP; market timestamp shown',_priceFetchedAt:data?.fetchedAt||null,_priceError:error||data?.cacheWarning||null};}
export async function loadPrices(documentData,feedIssue=''){const force=forced;forced=false;const jobs=documentData.stocks||[],result=new Array(jobs.length);let cursor=0,finished=0,errors=0,changed=0,cached=0,stale=0;
notice.textContent='Checking '+jobs.length+' ticker'+(jobs.length===1?'':'s')+'…';document.querySelector('#cards').setAttribute('aria-busy','true');
async function runner(){while(cursor<jobs.length){const i=cursor++,stock=jobs[i],symbol=stock.symbol,previous=states.get(symbol);let data=previous?.data,error='';const fresh=data&&Date.now()-Date.parse(data.fetchedAt)<300000;
if(previous?.retryAfter>Date.now()){error=previous.error||'Retry after a short wait';}else if(fresh&&!force){cached++;}else{try{const response=await fetchPrice(ENDPOINT+'/v1/stock?symbol='+encodeURIComponent(symbol),{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok){const wait=Number(response.headers.get('Retry-After'));const reason=response.status===429?'Rate limited; retry shortly':response.status===404?'No available market data':response.status>=500?'Price provider unavailable':'Price request rejected';const e=Error(reason+' (HTTP '+response.status+')');e.retry=Math.max(60000,Number.isFinite(wait)?Math.min(wait,300)*1000:60000);throw e;}const next=validate(await response.json(),symbol);if(signature(next)!==signature(data||stock))changed++;data=next;states.set(symbol,{data,error:next.cacheWarning||'',retryAfter:0});}catch(e){error=e.name==='TimeoutError'||e.name==='AbortError'?'Price request timed out':e instanceof TypeError?'Network or cross-origin request failed':e.message;states.set(symbol,{data,error,retryAfter:Date.now()+(e.retry||60000)});}}
if(error)errors++;if(data?.cacheWarning)stale++;result[i]=merge(stock,data,error);finished++;notice.textContent='Checking prices… '+finished+'/'+jobs.length;
}}
try{await Promise.all(Array.from({length:Math.min(3,jobs.length)},runner));const checked=new Intl.DateTimeFormat('en-NZ',{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());notice.textContent='Checked '+checked+' · '+(changed?changed+' ticker'+(changed===1?'':'s')+' updated':'No newer observation')+(cached?' · cached snapshots may be up to 5 min old':'')+(errors?' · '+errors+' lookup'+(errors===1?'':'s')+' failed; older data retained where available':'')+(stale?' · '+stale+' ticker'+(stale===1?'':'s')+' with stale or partial cached data; see timestamps':'')+(feedIssue?' · '+feedIssue:'');return {...documentData,stocks:result};}finally{document.querySelector('#cards').removeAttribute('aria-busy');}}
