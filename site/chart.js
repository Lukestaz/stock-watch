import {createLatestLoader} from './load-queue.mjs';
const $=s=>document.querySelector(s);
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
function add(tag,text,parent,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;parent.append(e);return e;}
function dateLabel(t){const d=new Date(t.slice(0,10)+'T12:00:00Z');return new Intl.DateTimeFormat('en-NZ',{day:'numeric',month:'short',...(d.getUTCFullYear()!==new Date().getUTCFullYear()?{year:'numeric'}:{}),timeZone:'UTC'}).format(d);}
function rangeLabel(a,b){const x=new Date(a.slice(0,10)+'T12:00:00Z'),y=new Date(b.slice(0,10)+'T12:00:00Z');const month=d=>new Intl.DateTimeFormat('en-NZ',{month:'short',timeZone:'UTC'}).format(d);if(x.getUTCFullYear()!==y.getUTCFullYear())return month(x)+' '+x.getUTCFullYear()+'–'+month(y)+' '+y.getUTCFullYear();return (x.getUTCMonth()===y.getUTCMonth()?month(y):month(x)+'–'+month(y))+' '+y.getUTCFullYear();}
const selections=new Map(),resizeHandlers=new Map();
const chartResize=new ResizeObserver(entries=>{for(const entry of entries)resizeHandlers.get(entry.target)?.(entry.contentRect.width);});
new MutationObserver(()=>{for(const svg of resizeHandlers.keys())if(!svg.isConnected){chartResize.unobserve(svg);resizeHandlers.delete(svg);}}).observe($('#cards'),{childList:true});
function chart(parent,stock){
 const bars=(stock.history||[]).filter(b=>b.t&&Number.isFinite(b.c)&&Number.isFinite(b.l)).sort((a,b)=>a.t.localeCompare(b.t));
 if(!bars.length){add('p','No daily history available yet.',parent);return;}
 const saved=selections.get(stock.symbol);let start=0,end=bars.length-1,showTarget=saved?.showTarget??true;
 const controls=add('div','',parent,'controls');const buttons={};
 const dates=add('div','',parent,'controls');
 const fromLabel=add('label','From ',dates),from=document.createElement('input');from.type='date';fromLabel.append(from);
 const toLabel=add('label','To ',dates),to=document.createElement('input');to.type='date';toLabel.append(to);
 const targetButton=add('button','Target line',controls);targetButton.type='button';
 const reset=add('button','Reset 6M',controls);reset.type='button';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('chart');svg.setAttribute('viewBox','0 0 900 480');svg.setAttribute('role','img');svg.setAttribute('aria-label',stock.symbol+' daily closing price chart. Use date and range controls to zoom; tap or move across chart to inspect.');parent.append(svg);
 const readout=add('div','Tap the chart to inspect a day.',parent,'readout');readout.setAttribute('aria-live','polite');
 const ranges=add('div','',parent,'range');
 function slider(label){const l=add('label',label,ranges),i=document.createElement('input');i.type='range';i.min=0;i.max=bars.length-1;i.step=1;l.append(i);return i;}
 const left=slider('Range start'),right=slider('Range end');
 const back=add('button','← Earlier',controls),forward=add('button','Later →',controls);
 const summary=add('p','',parent,'muted chart-summary'),detail=add('p','',parent,'muted chart-history-details');
 const W=900,L=18,T=40,B=415;let R=820,chartWidth=0,inspectedIndex=null;
 function node(tag,attrs,text){const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;}
 let overlay,vertical,horizontal,dot,ys,xs;
 function inspect(index){inspectedIndex=index;const b=bars[index],x=xs(index),y=ys(b.c);vertical.setAttribute('x1',x);vertical.setAttribute('x2',x);horizontal.setAttribute('y1',y);horizontal.setAttribute('y2',y);dot.setAttribute('cx',x);dot.setAttribute('cy',y);for(const n of [vertical,horizontal,dot])n.setAttribute('visibility','visible');readout.textContent=dateLabel(b.t)+' · Close '+money(b.c)+' · Low '+money(b.l);}
 function draw(){
  start=Math.max(0,Math.min(start,bars.length-1));end=Math.max(start,Math.min(end,bars.length-1));
  selections.set(stock.symbol,{from:bars[start].t.slice(0,10),to:bars[end].t.slice(0,10),showTarget});
  from.value=bars[start].t.slice(0,10);to.value=bars[end].t.slice(0,10);for(const i of [from,to]){i.min=bars[0].t.slice(0,10);i.max=bars.at(-1).t.slice(0,10);}left.value=start;right.value=end;
  for(const b of Object.values(buttons))b.setAttribute('aria-pressed','false');targetButton.setAttribute('aria-pressed',String(showTarget));back.disabled=start===0;forward.disabled=end===bars.length-1;
  svg.replaceChildren();const view=bars.slice(start,end+1);let low=Math.min(...view.map(b=>b.c)),high=Math.max(...view.map(b=>b.c));if(showTarget){low=Math.min(low,stock.target);high=Math.max(high,stock.target);}const pad=Math.max((high-low)*.1,high*.01,.01);low-=pad;high+=pad;
  const raw=(high-low)/5,power=10**Math.floor(Math.log10(raw));
  const step=[1,2,2.5,5,10].map(n=>n*power).reduce((a,b)=>Math.abs(Math.log(b/raw))<Math.abs(Math.log(a/raw))?b:a);
  const decimals=Math.min(8,Math.max(0,-Math.floor(Math.log10(step)))+(Math.abs(step/10**Math.floor(Math.log10(step))-2.5)<1e-8?1:0));
  const axis=[];for(let i=Math.ceil(low/step),count=0;i*step<=high+step*1e-8&&count<12;i++,count++){const value=i*step;axis.push({value,label:value.toLocaleString('en-US',{maximumFractionDigits:decimals})});}
  chartWidth=svg.getBoundingClientRect().width||W;const fontScale=Math.min(1,13*W/(25*chartWidth)),gap=12*fontScale;
  const longest=Math.max(3,...axis.map(t=>t.label.length));R=W-Math.min(220,Math.max(80,longest*15+28)*fontScale);
  xs=i=>L+(i-start)/Math.max(1,end-start)*(R-L);ys=v=>B-(v-low)/(high-low)*(B-T);
  for(const tick of axis){const y=ys(tick.value);node('line',{x1:L,x2:R,y1:y,y2:y,stroke:'#30425a','stroke-opacity':.55});node('text',{class:'chart-axis-label',x:R+gap,y:y+8*fontScale,fill:'#aebed2','font-size':25*fontScale},tick.label);}
  const ticks=new Set([start,Math.round(start+(end-start)/3),Math.round(start+2*(end-start)/3),end]);for(const i of ticks){const x=xs(i);node('text',{class:'chart-date-label',x,y:B+Math.max(20,38*fontScale),fill:'#c1cfe0','font-size':24*fontScale,'text-anchor':i===start?'start':i===end?'end':'middle'},dateLabel(bars[i].t));}
  node('text',{class:'chart-currency-label',x:R+gap,y:24,fill:'#aebed2','font-size':21*fontScale},'USD');
  if(showTarget){const y=ys(stock.target);node('line',{x1:L,x2:R,y1:y,y2:y,stroke:'#ffcf7b','stroke-dasharray':'7 5'});node('text',{class:'chart-target-label',x:L+5,y:y-9*fontScale,fill:'#ffcf7b','font-size':24*fontScale},'Target '+money(stock.target));}
  node('polyline',{points:view.map((b,j)=>xs(j+start)+','+ys(b.c)).join(' '),fill:'none',stroke:'#72e0c0','stroke-width':2.5});
  vertical=node('line',{x1:L,x2:L,y1:T,y2:B,stroke:'#cad9ed','stroke-dasharray':'3 4',visibility:'hidden'});horizontal=node('line',{x1:L,x2:R,y1:T,y2:T,stroke:'#cad9ed','stroke-dasharray':'3 4',visibility:'hidden'});dot=node('circle',{r:5,fill:'#fff',visibility:'hidden'});
  overlay=node('rect',{class:'chart-hit-area',x:L,y:T,width:R-L,height:B-T,fill:'transparent'});
  function position(e){const rect=svg.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*W;return Math.max(start,Math.min(end,Math.round(start+(x-L)/(R-L)*(end-start))));}
  overlay.addEventListener('pointermove',e=>inspect(position(e)));overlay.addEventListener('pointerdown',e=>inspect(position(e)));
  overlay.addEventListener('wheel',e=>{e.preventDefault();const anchor=position(e),old=Math.max(1,end-start),span=Math.min(bars.length-1,Math.max(4,Math.round(old*(e.deltaY>0?1.25:.8))));const ratio=(anchor-start)/old;start=Math.max(0,Math.min(bars.length-1-span,Math.round(anchor-span*ratio)));end=Math.min(bars.length-1,start+span);draw();},{passive:false});
  summary.textContent=view.length+' trading days · '+rangeLabel(bars[start].t,bars[end].t);
  detail.textContent='Selection: '+bars[start].t.slice(0,10)+' to '+bars[end].t.slice(0,10)+' · Lowest daily low '+money(Math.min(...view.map(b=>b.l)))+' · Full available history starts '+bars[0].t.slice(0,10);
  inspect(end);
 }
 function period(p){const anchor=new Date(bars.at(-1).t),cut=new Date(anchor);if(p==='All')start=0;else{if(p==='YTD')cut.setUTCMonth(0,1);else if(p==='1Y'||p==='2Y')cut.setUTCFullYear(cut.getUTCFullYear()-(p==='1Y'?1:2));else cut.setUTCMonth(cut.getUTCMonth()-parseInt(p));start=bars.findIndex(b=>b.t.slice(0,10)>=cut.toISOString().slice(0,10));if(start<0)start=0;}end=bars.length-1;draw();buttons[p]?.setAttribute('aria-pressed','true');}
 for(const p of ['1M','3M','6M','YTD','1Y','2Y','All']){const b=add('button',p==='All'?'All available':p,controls);b.type='button';buttons[p]=b;b.onclick=()=>period(p);}
 function dateIndex(value,last=false){if(last){for(let i=bars.length-1;i>=0;i--)if(bars[i].t.slice(0,10)<=value)return i;return 0;}const i=bars.findIndex(b=>b.t.slice(0,10)>=value);return i<0?bars.length-1:i;}
 from.onchange=()=>{if(!from.value)return;start=Math.min(dateIndex(from.value),end);draw();};to.onchange=()=>{if(!to.value)return;end=Math.max(dateIndex(to.value,true),start);draw();};
 left.oninput=()=>{start=Math.min(+left.value,end);draw();};right.oninput=()=>{end=Math.max(+right.value,start);draw();};
 function pan(dir){const step=Math.max(1,Math.round((end-start+1)/4)),delta=dir<0?-Math.min(step,start):Math.min(step,bars.length-1-end);start+=delta;end+=delta;draw();}
 back.onclick=()=>pan(-1);forward.onclick=()=>pan(1);reset.onclick=()=>period('6M');targetButton.onclick=()=>{showTarget=!showTarget;draw();};
 if(saved){start=dateIndex(saved.from);end=Math.max(start,dateIndex(saved.to,true));draw();}else period('6M');
 resizeHandlers.set(svg,width=>{if(Math.abs(width-chartWidth)<.5)return;const index=inspectedIndex,pressed=Object.values(buttons).map(b=>b.getAttribute('aria-pressed'));draw();if(index!==null&&index>=start&&index<=end)inspect(index);Object.values(buttons).forEach((b,i)=>b.setAttribute('aria-pressed',pressed[i]||'false'));});chartResize.observe(svg);
}
const load=createLatestLoader({
 async read(){const r=await fetch('./data.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Published data unavailable: HTTP '+r.status);return JSON.parse(await r.text());},
 commit(d){const health=$('#health');health.replaceChildren();add('span','Prices: delayed by at least 15 minutes; timestamps shown per stock.',health);health.append(document.createElement('br'));add('span','Notifications: setup status shown below; delivery not yet tested.',health);health.append(document.createElement('br'));add('span','Email: '+d.email+' · WhatsApp: '+d.whatsapp,health);health.append(document.createElement('br'));add('span','Monitor run '+d.updated+' · Backend report: '+d.status,health);const root=$('#cards');root.replaceChildren();for(const s of d.stocks){const a=add('article','',root);add('h2',s.symbol+' · entry '+money(s.target),a);const daily=(s.history||[]).filter(b=>Number.isFinite(b.c)).at(-1);const hasQuote=Number.isFinite(s.price)&&s.time;const useDaily=daily&&(!hasQuote||Date.parse(daily.t)>Date.parse(s.time));const price=useDaily?daily.c:hasQuote?s.price:null,time=useDaily?daily.t:s.time;add('p',price!==null?(useDaily?'Last available daily close ':'Latest stored delayed close ')+money(price)+' · '+((price/s.target-1)*100).toFixed(1)+'% versus target':'Awaiting validated price',a,'price');add('p',time?'Market-data timestamp '+time+' · Not an executable quote':'No validated timestamp',a,'muted');if(s.status)add('p','Intraday monitor: '+s.status,a,'muted');if(time&&Date.now()-Date.parse(time)>3600000)add('p','Historical/stale observation — not a current market price.',a,'error');chart(a,s);}},
 failed(error){$('#health').textContent=error.message;}
});
$('#refresh').onclick=load;load();setInterval(load,60000);
