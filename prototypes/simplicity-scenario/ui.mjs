import {FUNDS,calculate} from './engine.mjs';
const $=id=>document.getElementById(id);let last=null;
function clear(){last=null;$('result').textContent='Not calculated';$('error').textContent='';$('export').disabled=true;}
function row(id='',weight='',ret=''){
 const tr=document.createElement('tr');
 for(const [v,type,label] of [[id,'text','Component name'],[weight,'number','Weight percent'],[ret,'number','Period return percent']]){
  const td=document.createElement('td'),i=document.createElement('input');i.type=type;i.value=v;i.setAttribute('aria-label',label);if(type==='number')i.step='any';i.oninput=clear;td.append(i);tr.append(td);
 }
 const td=document.createElement('td'),b=document.createElement('button');b.textContent='Remove';b.onclick=()=>{tr.remove();clear();};td.append(b);tr.append(td);$('rows').append(tr);
}
const demo=document.createElement('option');demo.value='synthetic-demo';demo.textContent='Synthetic demo (not a Simplicity fund)';$('fund').append(demo);
for(const scheme of ['kiwisaver','investment']){const g=document.createElement('optgroup');g.label=scheme==='kiwisaver'?'KiwiSaver':'Investment';for(const f of FUNDS.filter(x=>x.scheme===scheme)){const o=document.createElement('option');o.value=f.seriesId;o.textContent=f.name;g.append(o);}$('fund').append(g);}
function reset(){clear();for(const id of ['anchor','fee','start','end'])$(id).value='';$('ack').checked=false;$('rows').replaceChildren();row();row();}
$('fund').onchange=reset;for(const id of ['anchor','fee','start','end','ack'])$(id).oninput=clear;
$('add').onclick=()=>{clear();row();};
$('demo').onclick=()=>{$('fund').value='synthetic-demo';reset();$('anchor').value='1';$('fee').value='0';$('start').value='2026-11-25';$('end').value='2026-12-25';$('rows').replaceChildren();row('Synthetic growth','60','5');row('Synthetic income','40','-1');};
$('run').onclick=()=>{clear();try{const input={kind:'forward_scenario',fundId:$('fund').value,accepted:$('ack').checked,returnBasis:'NZD-gross-total-return',referencePrice:$('anchor').value,annualFeePct:$('fee').value,referenceDate:$('start').value,scenarioDate:$('end').value,components:[...$('rows').children].map(tr=>{const i=tr.querySelectorAll('input');return {id:i[0].value,weightPct:i[1].value,returnPct:i[2].value};})};last=calculate(input);$('result').textContent='Hypothetical reference price: NZD '+last.scenarioReferencePrice.toFixed(6)+'\nGross return: '+last.grossReturnPct.toFixed(4)+'%; net of explicit fee: '+last.netReturnPct.toFixed(4)+'%\n'+last.contributions.map(c=>c.id+': '+c.contributionPercentagePoints.toFixed(4)+' percentage points before fee').join('\n');$('export').disabled=false;}catch(e){$('error').textContent=e.message;}};
$('export').onclick=()=>{if(!last)return;const u=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='hypothetical-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};reset();
