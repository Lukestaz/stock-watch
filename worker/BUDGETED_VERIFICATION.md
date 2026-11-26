# Fully composed budgeted verification candidate: disabled

createBudgetedAlertDestinationApi composes the existing session authenticator, destination routes, D1 verification store, fixed mail template and durable mail budget. Only the provider send(message) function remains an injected transport. Admission and per-account request-limiter decisions are also injected and must be implemented safely before enablement. The module defaults disabled and is not imported by the production runtime. No migration, deployment, credentials or live sends are part of this patch.

The new factory is the intended candidate for future integration; older route-only/session-only factories remain lower-level building blocks. Supplying a real mail callback to older factories does not automatically provide this quota-before-storage behaviour.

## Ordering and one-use reservation proof

The route authenticates the session and validates input. Its guarded begin operation reserves durable verification-mail capacity before changing the destination or challenge. Quota denial therefore leaves an existing code or verified destination intact. A successful challenge commit creates an in-memory capability confined to that one request. It binds the authenticated account, address, destination hash, challenge hash, expiry and reservation time.

The fixed mailer's reserve hook checks and consumes that capability rather than reserving a second database slot. The callback additionally matches the raw token's hash to the stored challenge hash. No capability is accepted from the browser or shared between requests. The provider receives only the fixed sender, recipient, subject and body. Existing default budget policy is unchanged. Verification consumes its database challenge atomically without allocating another mail slot and leaves alerts disabled.

Reservations remain charged if challenge storage fails after reservation or if provider sending fails/has unknown outcome. There is no automatic retry, refund, cross-channel fallback or claim of exactly-once delivery. A permitted later registration supersedes the old code; overlapping registrations and transport outcomes can still leave a mailed code superseded, so UI must explain that only the latest code is valid.

## Test scope and remaining work

Run node --test worker/test/account-budgeted-verification.test.mjs. Eleven local tests used real source modules and real SQL on a targeted temporary SQLite schema, with seeded sessions, mocked provider I/O and admission/limiter decisions. The committed bridge fixtures apply the repository migration chain in CI; full-chain CI remains unverified until it runs. Tests cover two-account isolation, quota-preserved codes/verified destinations, single charging, concurrent quota claims, generic provider failure, storage rollback, expiry and one-time consumption. They do not exercise actual Cloudflare D1, Google login, browser cookie delivery or real email.

Before production: select and implement a credential-backed provider transport with timeouts, implement admission/request quotas and retention, review provider-wide aggregate limits, add frontend verification and separate target/channel consent, and build account alert evaluation/outbox dispatch. Apply private migrations and wire public routes only through separately approved changes. WhatsApp account delivery remains unavailable. PR #3's legacy notification work remains separate.
