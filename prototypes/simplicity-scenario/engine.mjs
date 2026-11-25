import {SIMPLICITY_CATALOGUE} from '../../worker/src/simplicity-catalogue.mjs';
export const FUNDS = SIMPLICITY_CATALOGUE;
function decimal(value, label, min, max) {
  const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  if (!/^[+-]?\d{1,12}(\.\d{1,6})?$/.test(s) || !Number.isFinite(Number(s)) || Number(s) < min || Number(s) > max) throw Error(label + ' is required, numeric and within limits (up to six decimal places)');
  const negative = s.startsWith('-');
  const [a,b=''] = s.replace(/^[+-]/,'').split('.');
  return {n:Number(s), fixed:BigInt(a)*1000000n*(negative?-1n:1n)+BigInt(b.padEnd(6,'0'))*(negative?-1n:1n)};
}
function day(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('Valid ISO dates required');
  const ms = Date.parse(s+'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10)!==s) throw Error('Invalid calendar date');
  return ms/86400000;
}
export function calculate(input) {
  if (!input || input.kind !== 'forward_scenario') throw Error('Only hypothetical forward scenarios; nowcasts unavailable');
  if (input.fundId!=='synthetic-demo' && !FUNDS.some(f=>f.seriesId===input.fundId)) throw Error('Unknown scheme/fund identity');
  if (input.accepted!==true || input.returnBasis!=='NZD-gross-total-return') throw Error('Accept hypothetical NZD gross total-return assumptions');
  const anchor=decimal(input.referencePrice,'Hypothetical reference price',0.000001,1000000).n;
  const fee=decimal(input.annualFeePct,'Annual fee',0,99).n;
  const days=day(input.scenarioDate)-day(input.referenceDate);
  if (days<0 || days>3660) throw Error('Horizon must be 0 to 3660 calendar days');
  if (!Array.isArray(input.components) || input.components.length<1 || input.components.length>20) throw Error('Provide 1 to 20 components');
  let weights=0n,weighted=0n;const seen=new Set();
  const contributions=input.components.map(c=>{
    if (!c || typeof c.id!=='string' || !c.id.trim() || c.id.length>80 || seen.has(c.id.trim())) throw Error('Unique nonempty component names required');
    seen.add(c.id.trim());const w=decimal(c.weightPct,'Weight',0,100),r=decimal(c.returnPct,'Cumulative return',-100,10000);
    if (days===0 && r.n!==0) throw Error('Zero-day scenarios require zero returns');
    weights+=w.fixed;weighted+=w.fixed*r.fixed;
    return {id:c.id.trim(),weightPct:w.n,returnPct:r.n,contributionPercentagePoints:Number(w.fixed*r.fixed)/1e14};
  });
  if (weights!==100000000n) throw Error('Weights must sum to exactly 100%; unknowns are not zero or normalised');
  const grossPct=Number(weighted)/1e14,feeFactor=(1-fee/100)**(days/365),factor=(1+grossPct/100)*feeFactor;
  return {kind:'forward_scenario',modelVersion:'js-scenario-0.2.0',fundId:input.fundId,calendarDays:days,
    referencePriceType:'user hypothetical; not a verified official price',scenarioReferencePrice:anchor*factor,
    grossReturnPct:grossPct,netReturnPct:(factor-1)*100,contributions,
    assumptions:JSON.parse(JSON.stringify(input)),nowcastAvailable:false,approvedForModelling:false,
    limitations:['Fixed starting weights and 365-day compound fee; no tax, cash flows, rebalancing or intervals.',
      'Input returns must already include distributions, FX and hedging effects in NZD, before the explicit fee.',
      'Unlisted returns are explicit assumptions. No current market proxies or official price anchor verified.',
      'BigInt six-decimal input weighting; IEEE-754 fee/output arithmetic, not production NAV accounting.',
      'Hypothetical sensitivity only; not an official price, forecast, nowcast or executable switch price.']};
}
