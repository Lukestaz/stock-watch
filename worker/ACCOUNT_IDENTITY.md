# Identity and sessions: non-production core

This module is not imported by the live Worker. No Google client, key loader, D1 binding, browser routes or sign-in UI is configured. Do not deploy this core as an authentication service.

The verifier checks RS256 with RSA keys of at least 2048 bits, issuer, scalar client audience, optional authorized party, expiry, issued-at, optional not-before, stable subject and login nonce. Keys are supplied by a trusted server-side loader, never HTTP request input. Tests use locally generated RSA fixtures, not Google tokens. Google recommends a supported client/JWT library; the direct WebCrypto verifier requires security review or replacement with a maintained library before production. It intentionally accepts a restricted token profile, not every valid OIDC token.

The session service creates a 10-minute challenge and a nonce equal to its SHA-256 hash. Completion consumes the challenge with a unique session-hash marker and provisions user/watchlist/session in one transaction. Replay and racing exchanges cannot both succeed. Account lookup uses Google subject, not email. New watchlists are empty and have no alerts. Existing device settings are not automatically imported.

Session secrets have 256 random bits; only hashes are stored. Cookie helpers use __Host- names, Secure, HttpOnly, Path=/ and SameSite=Lax. Proposed expiry: 30-day absolute, seven-day idle, checked server-side. Authentication updates last_seen_at on each valid request; assess write costs before production. Logout deletes the presented session; it does not revoke other devices or Google itself. New logins issue new tokens; old sessions remain until logout/expiry.

Launch gates:
- Choose same-origin hosting or an explicitly reviewed same-site design. GitHub Pages and workers.dev are cross-site; this cookie policy is not a working drop-in for that pairing. Do not weaken to SameSite=None as an unreviewed workaround.
- Build a trusted Google key loader with fixed official endpoint, TLS, timeouts, bounded responses, cache-control/key rotation handling and failure tests. Configure the real Google OAuth web client separately.
- Add HTTPS-only bounded POST login/logout routes, strict origin and CSRF defenses, rate limits, signup/account quotas and safe errors. Bind completeLogin's challenge to the single HTTP-only login cookie, not an arbitrary body field. Return only the public nonce from beginLogin; send the raw challenge only via Set-Cookie. Never serialize service return values wholesale into JSON. Apply both completion cookies as separate Set-Cookie headers.
- If using Google's direct POST mode, verify its g_csrf_token cookie/body values as documented. If using a JS callback, implement and test the application's equivalent login-CSRF protection. Nonce validation does not replace HTTP CSRF controls.
- Wire authenticate into the account handler and test two authenticated users end-to-end, logout races, expired cookies, key rotation/provider failure, browser privacy settings and mobile reload behaviour. No production security claim follows from core tests alone.
- Add expiry cleanup, session management/revoke-all UI, storage quotas and secret-free operational monitoring. Treat session hashes as private; never publish identity tables or log tokens/cookies.
- Verify all three migrations and transaction semantics on actual D1, then obtain separate deployment approval. Existing guest mode, public prices and legacy notifications remain unchanged.

Run local core tests: node --test worker/test/account-identity.test.mjs
