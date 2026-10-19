# Account API core (not deployed)

account-api.mjs is an internal handler factory, not imported by the production Worker. It introduces no live routes, credentials, bindings or notification enrollment.

Run locally: node --test worker/test/account-api.test.mjs

Tests use mocked authentication/storage. They verify request validation, verified-principal plumbing, denial paths and conflict responses; they do not prove Google identity verification, database authorization or atomic D1 updates. The existing schema CI does not run these Node tests.

Before routing traffic:
- Implement Google token verification and revocable sessions. authenticate(request) must return a server-verified {userId}, null for invalid sessions, or throw on service failure. Never trust request headers/body/query for identity.
- Choose same-site hosting/session architecture. Strict Origin checks here are defense in depth, not authentication. GET requests without Origin are currently rejected. Add browser integration/preflight and CSRF tests before choosing CORS/cookie policy.
- Implement store.read(userId) returning a user-scoped snapshot and store.replace(userId,expectedRevision,stocks) returning the committed snapshot or null on conflict. Compare-and-swap, replacement and revision increments must be atomic. Never implement check-then-write as separate unguarded statements.
- Preserve private alert settings, target revisions and monitor-applied revision correctly. Enrollment is deliberately unavailable in this core and any alertsEnabled:true update returns 409. Revisit full-list save semantics before enabling alerts.
- Add real cross-user database tests, concurrent-save tests, session expiry/revocation and browser tests. Mock tests alone do not establish isolation.
- Add authenticated per-user/IP rate limits, resource quotas, operational monitoring and secret-free logs. The request body limit is 32768 bytes and the watchlist limit is 100 entries.
- Configure D1 and Google separately with explicit approval, then integrate and verify before deployment. Keep public price lookup, guest/local mode and the legacy alert monitor unchanged until cutover is approved.
