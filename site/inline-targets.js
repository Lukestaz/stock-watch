const root = document.querySelector('#cards');
const style = document.createElement('style');
style.textContent = `.inline-target-toggle{font:inherit;color:inherit;background:transparent;border:0;padding:0;text-align:left;min-height:44px}.inline-target-form{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 12px}.inline-target-form[hidden]{display:none}.inline-target-form input{width:8rem;min-height:44px}.inline-target-form button{min-height:44px}.inline-target-form p{flex-basis:100%;margin:0;font-size:.8rem;color:#b5c4da}.inline-target-toggle:focus-visible{outline:2px solid #72e0c0;outline-offset:4px}`;
document.head.append(style);

function rowFor(symbol) {
  return [...document.querySelectorAll('.watchlist-row')].find(row => row.querySelector('strong')?.textContent === symbol);
}
function controls(symbol) {
  const row = rowFor(symbol);
  return {input:row?.querySelector('input'), save:row?.querySelector('.editor-save') || [...(row?.querySelectorAll('button') || [])].find(b => b.textContent === 'Save target')};
}
function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
function lock(node, value) { if (node.disabled !== value) node.disabled = value; }
function changed(input) { input.dispatchEvent(new Event('input', {bubbles:true})); }

function enhance() {
  for (const card of root.querySelectorAll('article')) {
    const symbol = card.querySelector('h2')?.textContent.split(' · ')[0];
    const badge = card.querySelector('.stock-target');
    const source = controls(symbol);
    if (!badge || !source.input || !source.save) continue;
    let toggle = badge.querySelector('.inline-target-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'inline-target-toggle';
      toggle.setAttribute('aria-label', 'Edit ' + symbol + ' target');
      toggle.setAttribute('aria-expanded', 'false');
      const value = badge.querySelector('span');
      if (value) toggle.append(value); else toggle.textContent = 'Edit target';
      badge.prepend(toggle);
      const form = document.createElement('form');
      form.className = 'inline-target-form'; form.hidden = true; form.noValidate = true;
      form.setAttribute('aria-label', 'Edit ' + symbol + ' target');
      const label = document.createElement('label'); label.textContent = 'Target USD ';
      const input = document.createElement('input');
      input.type = 'number'; input.inputMode = 'decimal'; input.min = '0.000001'; input.max = '1000000000'; input.step = 'any';
      input.setAttribute('aria-label', symbol + ' inline target in USD'); label.append(input);
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      form.append(label, save, cancel, status); badge.closest('.stock-heading').after(form);
      function show(open) {
        form.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
        if (open) { input.focus(); input.select(); }
      }
      toggle.onclick = () => show(form.hidden);
      input.oninput = () => {
        const current = controls(symbol);
        if (!current.input || current.input.disabled) return;
        current.input.value = input.value; changed(current.input);
      };
      function cancelEdit() {
        const current = controls(symbol);
        if (!current.input || current.input.disabled) return;
        current.input.value = current.input.defaultValue; input.value = current.input.value;
        changed(current.input); show(false); toggle.focus();
      }
      cancel.onclick = cancelEdit;
      input.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); } };
      form.onsubmit = event => {
        event.preventDefault();
        const current = controls(symbol);
        if (!current.input || !current.save || current.input.disabled || current.save.disabled) return;
        current.input.value = input.value;
        current.save.click();
        enhance();
      };
      if (source.input.value !== source.input.defaultValue) {
        form.hidden = false; toggle.setAttribute('aria-expanded', 'true');
      }
    }
    const form = card.querySelector('.inline-target-form');
    const input = form.querySelector('input');
    if (input.value !== source.input.value) input.value = source.input.value;
    const paused = source.input.disabled || source.save.disabled;
    lock(toggle, paused);
    for (const control of form.querySelectorAll('input,button')) lock(control, paused);
    const message = document.querySelector('.watchlist-message')?.textContent || '';
    setText(form.querySelector('[role=status]'), (message ? message + ' ' : '') + 'Scheduled alerts unchanged.');
  }
}
new MutationObserver(enhance).observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
document.addEventListener('input', event => { if (event.target.matches('.watchlist-row input')) enhance(); });
enhance();
