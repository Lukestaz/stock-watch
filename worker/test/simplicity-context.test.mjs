import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationLabel, publicationContext, renderFundContext} from '../../site/simplicity-view.mjs';

const snapshot = {asOfDate:'2026-11-19', fetchedAt:'2026-11-23T18:48:30Z', freshness:'unchecked'};

test('unchecked and missing freshness never claim the price is current', () => {
  for (const value of ['unchecked', undefined, null, 'unknown', '__proto__', 'constructor']) {
    assert.equal(publicationLabel(value), 'Not independently verified');
  }
});
test('configured freshness is not represented as independent publication verification', () => {
  assert.match(publicationLabel('fresh'), /configured expected date/);
  assert.match(publicationLabel('fresh'), /not independently verified/);
  assert.equal(publicationLabel('stale'), 'Behind the configured expected date');
  assert.match(publicationLabel('future-dated'), /needs review/);
});
test('cached data is not described as a new CSV download', () => {
  const model = publicationContext(snapshot, 'cached');
  assert.match(model.source, /D1-cached/);
  assert.match(model.source, /does not necessarily download/);
  assert.equal(model.warning, false);
});
test('failed refresh is separate from publication status', () => {
  const model = publicationContext(snapshot, 'stale');
  assert.match(model.source, /refresh unavailable/);
  assert.equal(model.publication, 'Not independently verified');
  assert.equal(model.warning, true);
});
test('fresh response does not prove a newer valuation exists', () => {
  assert.match(publicationContext(snapshot, 'refreshed').source, /does not prove/);
});
test('retrieval uses Auckland time across the UTC date boundary', () => {
  const value = publicationContext(snapshot, 'cached').retrieved;
  assert.match(value, /24/);
  assert.match(value, /7:48:30/);
  assert.match(value, /NZ time/);
});
test('missing retrieval and future-dated observations remain explicit', () => {
  assert.equal(publicationContext({}, 'unknown').retrieved, 'Unavailable');
  assert.equal(publicationContext({...snapshot, freshness:'future-dated'}, 'cached').warning, true);
});
test('no estimate is fabricated and source data is not mutated', () => {
  const before = JSON.stringify(snapshot);
  for (const cache of ['cached', 'stale', 'refreshed', 'unknown']) {
    assert.equal(publicationContext(snapshot, cache).estimateAvailable, false);
  }
  assert.equal(JSON.stringify(snapshot), before);
});

class Element {
  constructor(doc, tag) {this.ownerDocument=doc;this.tag=tag;this.children=[];this.textContent='';this.attributes={};}
  setAttribute(name,value) {this.attributes[name]=value;}
  append(child) {this.children.push(child);}
  replaceChildren(...children) {this.children=children;}
  insertBefore(child,before) {const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,child);}
  querySelector(selector) {
    for (const child of this.children) {
      if ('#'+child.id===selector) return child;
      const found=child.querySelector(selector);if(found)return found;
    }
    return null;
  }
}
const text = node => [node.textContent,...node.children.map(text)].join(' ');

test('context rendering is idempotent, accessible and preserves published content', () => {
  const doc = {createElement:tag=>new Element(doc,tag)};
  const result = doc.createElement('div');
  const price=doc.createElement('section'), chart=doc.createElement('section');
  price.textContent='Published price';chart.textContent='Official history';result.append(price);result.append(chart);
  renderFundContext(result,snapshot,'cached');
  const panel=result.querySelector('#publication-context');
  assert.equal(result.children[1],panel);
  assert.equal(panel.attributes['aria-labelledby'],'publication-heading');
  assert.match(text(panel),/two-working-day publication delay/);
  assert.match(text(panel),/exact CSV update time and holiday policy have not been verified/);
  assert.match(text(panel),/Estimated unpublished price/);
  assert.match(text(panel),/Unavailable — no estimated price is currently calculated or plotted/);
  renderFundContext(result,snapshot,'stale');
  assert.equal(result.children.length,3);
  assert.equal(result.querySelector('#publication-context'),panel);
  assert.match(text(panel),/Source refresh unavailable/);
  assert.equal(chart.textContent,'Official history');
  assert.equal(price.textContent,'Published price');
});
