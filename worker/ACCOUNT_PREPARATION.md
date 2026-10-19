# Account-sync preparation: not deployed

This patch adds a maintained preview entry point (`src/account-app.mjs`), a default-off trusted account-handler hook, and regression tests. It does not change either deployment workflow, provision D1, configure Google, enable accounts, or change device data. The current deploy-app.yml still generates its own Worker; moving deployment to this entry point requires a separate reviewed change.

## Current implementation versus older checklists

The key loader (`account-google-keys.mjs`) and HTTP login routes (`account-login-routes.mjs`) now exist. Older ACCOUNT_IDENTITY.md and ACCOUNT_INTEGRATION.md checklists describing them as unbuilt are stale on that point. Their production launch warnings still apply.

The maintained app exports `createApp({accounts})` and a default instance with accounts disabled. Environment variables alone cannot enable accounts. A caller must explicitly provide boolean `enabled: true`, an exact HTTPS `allowedOrigin`, and a trusted server-side `handle` function. The hook strips `/api` before delegation, preserves request method/body/cookies, enforces same-origin request metadata, and fails closed when disabled or misconfigured. The hook itself is not an identity verifier and must never be connected to an unauthenticated handler.

A later composition must dispatch `/v1/auth/*` to createLoginRoutes and `/v1/watchlist` to createSessionWatchlistApi using the same D1 database and Google configuration. That composition, production rate limits, signup/access policy and storage quotas are not supplied or enabled by this patch.

## Verification

Run `node --test worker/test/account-*.test.mjs`. Existing account CI already matches the new source/test paths. New suites cover preview routing, default-off hooks, key-loader caching/failures, and login route origin/body/cookie/limiter handling. Login routes use fake identity services; Google key requests use mocked fetch. These are not real Google login, live D1, browser or production-security tests.

Before launch: review or replace the custom token verifier; create/configure the Google client; provision and verify all D1 migrations; compose and rate-limit real handlers; implement browser sign-in, account data and conflict handling; require explicit local import; verify real browser cookies and two-device isolation. Alerts remain unavailable. Do not modify stock-watch-prices to enable accounts.
