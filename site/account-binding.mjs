export function bindAccountWatchlist({session,createSync,transition,changed}) {
  let resetting = false;
  const sync = createSync({changed(snapshot) {
    if (resetting) return;
    if (snapshot.status === 'guest' && session.get() === 'signed-in') {
      session.set('guest'); return;
    }
    changed(snapshot);
  }});
  const stop = session.subscribe(value => {
    resetting = true;
    try { sync.disconnect(); } finally { resetting = false; }
    transition(value);
    if (value === 'signed-in') void sync.load();
  });
  return {sync,stop};
}
