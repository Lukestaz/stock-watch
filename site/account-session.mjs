export function createSessionState() {
  let value = 'checking';
  const listeners = new Set(), guards = new Set(), protections = new Set();
  return {
    get: () => value,
    set(next) {
      if (!['checking','guest','signed-in','unavailable'].includes(next)) throw Error('Invalid session state');
      if (next === value) return;
      value = next; for (const listener of listeners) listener(value);
    },
    subscribe(listener) { listeners.add(listener); listener(value); return () => listeners.delete(listener); },
    guard(check) { guards.add(check); return () => guards.delete(check); },
    protect(check) { protections.add(check); return () => protections.delete(check); },
    hasUnsaved: () => [...protections].some(check => check()),
    canChange: () => [...guards].every(check => check())
  };
}
export const accountSession = createSessionState();
