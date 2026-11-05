# Candidate email-destination routes: disabled and not production-wired

This patch adds a route factory and ten contract tests. It does not implement a durable D1 verification store, email transport, session composition, frontend, opt-in endpoints or alert delivery. The production runtime does not import it. Existing enrolment blocks remain. No migration is added or applied by this patch.

## Candidate interface

POST /v1/alert-destination/email accepts exactly {address}. POST /v1/alert-destination/email/verify accepts exactly {token}. Both require the exact configured HTTPS request origin and Origin header, same-origin Sec-Fetch-Site when present, JSON, an authenticated principal, and a limiter returning literal true. Bodies are streamed with a 2048-byte cap. Email syntax deliberately supports a conservative ASCII subset, not every valid mailbox syntax.

The factory defaults disabled and needs explicit trusted server dependencies. authenticate must validate the existing session and return its internal userId. Client bodies cannot supply user IDs, providers, verification state or opt-ins. limit(request,userId,path) must enforce durable per-user and destination/global abuse budgets; production composition also needs unauthenticated admission controls. The injected clock uses integer Unix seconds.

Tokens are 32 cryptographically random bytes encoded as 64 lowercase hex characters, with ten-minute expiry. Only their SHA-256 hashes go to the store. Raw tokens go only to the trusted verification mail adapter, never response bodies, URLs, storage or logs. There is no automatic mail retry. A failed or uncertain send leaves an unverified, disabled destination and returns a generic 503.

## Required durable storage contract (not implemented here)

Only trusted code may invoke these operations. beginEmailVerification({userId,address,challengeHash,now,expiresAt}) must atomically bind the address to that existing user, disable it, clear verification, supersede previous challenges and snapshot the current destination revision. Never reset an existing provider binding from client input. A same-address reissue must also invalidate prior challenges. It returns true only after commit.

completeEmailVerification({userId,challengeHash,now}) must atomically compare that user's current challenge hash, require createdAt <= now < expiresAt, match the current destination address/revision/binding, consume once and set verified_at while leaving enabled=0. Concurrent consumers must have exactly one successful database claim; return false for expiry, replay, wrong account, old revision or removed destination. Do not mark a destination verified in a separate unguarded transaction. Failed operations must roll back. Durable challenge schema, cleanup, quotas and race tests remain to be built.

sendVerification({to,token,expiresAt}) must use shared server-side sender credentials, a fixed verification template and a bounded destination. It returns true for provider acceptance only, not proven delivery. A verification response indicates address-control proof, not alert enrolment; target/channel opt-ins remain separate. The schema alone does not enforce WhatsApp provider readiness; runtime eligibility must keep it unavailable until supported.

## Verification limits

Run node --test worker/test/account-alert-destinations.test.mjs. Tests use an in-memory store contract, mocked authentication, limiter and mail sender. They exercise route boundaries, two users, expiry, replay and simulated concurrent consumption, not actual sessions, durable SQL races, SMTP, D1 or live verification. Do not enable these routes until real adapters and integration tests exist.
