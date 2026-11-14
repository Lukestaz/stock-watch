import { validateFundView } from './simplicity-view.mjs';
const $ = s => document.querySelector(s), scheme = $('#scheme'), fund = $('#fund'), result = $('#result'), status = $('#status'), reload = $('#reload'), chart = $('#chart');
const catalogue = { kiwisaver:[['high-growth','High Growth'],['growth','Growth'],['balanced','Balanced'],['default','Default'],['conservative','Conservative'],['defensive','Defensive']], investment:[['high-growth','High Growth'],['growth','Growth'],['balanced','Balanced'],['conservative','Conservative']] };
const key = 'stock-watch:simplicity-ui:v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
scheme.value = Object.hasOwn(catalogue, saved.scheme) ? saved.scheme : 'kiwisaver';
let range = ['30','90','180','365','all'].includes(saved.range) ? saved.range : '180';
let displayed = null, controller = null, sequence = 0, expanded = false, rows = [], points = [], inspected = -1;
const format = new Intl.DateTimeFormat('en-NZ',{ weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC' });
const date = value => format.format(new Date(value + 'T00:00:00Z'));
const change = (price, previous) => previous ? { amount:price-previous, percent:100*(price/previous-1) } : null;
const signed = (value, places) => { const n = Number(value.toFixed(places)); return (n>0?'+':n<0?'−':'') + Math.abs(n).toFixed(places); };
const changeText = c => c ? `${c.amount>0?'+':c.amount<0?'−':''}$${Math.abs(c.amount).toFixed(4)} (${signed(c.percent,2)}%)` : '—';
function tint(element,c) { element.classList.toggle('positive',!!c&&c.amount>0); element.classList.toggle('negative',!!c&&c.amount<0); }
function populate(preferred) {
  fund.replaceChildren();
  for (const [slug,label] of catalogue[scheme.value]) { const o=document.createElement('option'); o.value=`simplicity:${scheme.value}:${slug}`; o.textContent=label; fund.append(o); }
  if ([...fund.options].some(o=>o.value===preferred)) fund.value=preferred;
}
populate(saved.fund);
function remember() { try { localStorage.setItem(key,JSON.stringify({scheme:scheme.value,fund:fund.value,range})); } catch {} }
function message(text,state='loading') { status.textContent=text; status.hidden=!text; status.dataset.state=state; }
function inspect(index) {
  if (!rows.length) return;
  index=Math.max(0,Math.min(rows.length-1,index)); if(index===inspected)return; inspected=index;
  $('#chart-readout').textContent=`${date(rows[index].asOfDate)} · $${rows[index].price.toFixed(4)} NZD`;
  $('#cursor').setAttribute('x1',points[index].x); $('#cursor').setAttribute('x2',points[index].x);
  $('#point').setAttribute('cx',points[index].x); $('#point').setAttribute('cy',points[index].y);
}
function draw() {
  if(!displayed)return;
  const all=displayed.history, end=Date.parse(all.at(-1).asOfDate+'T00:00:00Z');
  rows=range==='all'?all:all.filter(r=>Date.parse(r.asOfDate+'T00:00:00Z')>=end-Number(range)*86400000);
  const prices=rows.map(r=>r.price), min=Math.min(...prices), max=Math.max(...prices), pad=max===min?Math.max(min*.02,.0001):(max-min)*.08, low=min-pad, high=max+pad;
  const start=Date.parse(rows[0].asOfDate+'T00:00:00Z'), span=end-start;
  points=rows.map(r=>({x:span?20+760*(Date.parse(r.asOfDate+'T00:00:00Z')-start)/span:400,y:220-200*(r.price-low)/(high-low)}));
  $('#line').setAttribute('points',points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
  for(const [id,n] of [['high',high],['mid',(high+low)/2],['low',low]])$('#axis-'+id).textContent=n.toFixed(4);
  $('#date-start').textContent=date(rows[0].asOfDate); $('#date-end').textContent=date(rows.at(-1).asOfDate);
  $('#extent').textContent=rows.length>1?'Range change '+changeText(change(rows.at(-1).price,rows[0].price)):'One observation in this range';
  for(const b of document.querySelectorAll('[data-range]'))b.setAttribute('aria-pressed',String(b.dataset.range===range));
  inspected=-1; inspect(rows.length-1);
}
function table() {
  const history=displayed.history, body=$('#history'); body.replaceChildren();
  for(let i=history.length-1;i>=(expanded?0:Math.max(0,history.length-7));i--) {
    const r=history[i], c=change(r.price,history[i-1]?.price), tr=document.createElement('tr');
    for(const text of [date(r.asOfDate),'$'+r.price.toFixed(4),c?signed(c.percent,2)+'%':'—']) { const td=document.createElement('td');td.textContent=text;tr.append(td); }
    tint(tr.lastElementChild,c);body.append(tr);
  }
  const toggle=$('#history-toggle');toggle.hidden=history.length<=7;toggle.textContent=expanded?'Show recent':`View all (${history.length})`;toggle.setAttribute('aria-expanded',String(expanded));
}
function render(data,cache) {
  displayed=data;expanded=false;const s=data.snapshot, previous=data.history.at(-2), c=change(s.price,previous?.price);
  $('#name').textContent=scheme.selectedOptions[0].textContent+' · '+fund.selectedOptions[0].textContent;
  $('#price').textContent='$'+s.price.toFixed(4);$('#price-date').textContent=date(s.asOfDate);$('#price-date').dateTime=s.asOfDate;
  $('#change').textContent=changeText(c);tint($('#change'),c);$('#change-date').textContent=previous?'since '+date(previous.asOfDate):'No earlier observation';
  $('#stale-badge').hidden=cache!=='stale'&&s.freshness!=='stale';
  $('#metadata').textContent=`Observation date: ${s.asOfDate}\nRetrieved: ${new Date(s.fetchedAt).toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})} (NZ time)\nD1 cache: ${cache}\nPublication freshness: ${s.freshness||'unchecked'}\nIdentity: unverified; alerts: disabled`;
  table();draw();result.hidden=false;
  message(cache==='stale'?'Refresh unavailable — showing stale data dated '+date(s.asOfDate)+'.':s.freshness==='stale'?'Prices are behind the expected publication date.':'','warning');
}
async function load() {
  const token=++sequence;controller?.abort();controller=new AbortController();
  const current=controller,timer=setTimeout(()=>current.abort(),20000),series=fund.value;
  displayed=null;rows=[];points=[];inspected=-1;result.hidden=true;result.setAttribute('aria-busy','true');reload.disabled=true;reload.setAttribute('aria-busy','true');message('Loading fund prices…');
  try {
    const response=await fetch('/api/v1/fund?series='+encodeURIComponent(series),{signal:current.signal,cache:'no-store',credentials:'same-origin'});
    if(token!==sequence)return;const body=await response.json();if(token!==sequence)return;
    if(response.ok)render(validateFundView(body,series),body.cache?.state||'unknown');
    else if(response.status===503&&body.cache?.state==='stale'&&body.lastSuccessful)render(validateFundView(body.lastSuccessful,series),'stale');
    else message(response.status===404?'Fund preview is not enabled on this deployment.':`Fund prices unavailable (HTTP ${response.status}). Try Refresh.`,'error');
  } catch { if(token===sequence){displayed=null;result.hidden=true;message('Fund prices could not be loaded or validated. Try Refresh.','error');} }
  finally { clearTimeout(timer);if(token===sequence){reload.disabled=false;reload.setAttribute('aria-busy','false');result.setAttribute('aria-busy','false');} }
}
scheme.addEventListener('change',()=>{const slug=fund.value.split(':').at(-1);populate(`simplicity:${scheme.value}:${slug}`);remember();load();});
fund.addEventListener('change',()=>{remember();load();});reload.addEventListener('click',load);
$('#range').addEventListener('click',event=>{const b=event.target.closest('button[data-range]');if(b){range=b.dataset.range;remember();draw();}});
$('#history-toggle').addEventListener('click',()=>{expanded=!expanded;table();});
chart.addEventListener('keydown',event=>{if(!rows.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();inspect(event.key==='Home'?0:event.key==='End'?rows.length-1:inspected+(event.key==='ArrowLeft'?-1:1));});
function pointer(event) { if(!rows.length)return;const box=chart.getBoundingClientRect(),x=(event.clientX-box.left)*800/box.width;let nearest=0;for(let i=1;i<points.length;i++)if(Math.abs(points[i].x-x)<Math.abs(points[nearest].x-x))nearest=i;inspect(nearest); }
chart.addEventListener('pointerdown',event=>{chart.focus({preventScroll:true});pointer(event);});
chart.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||event.buttons===1)pointer(event);});
load();
