# Account sync: staged implementation

Status: schema foundation only. No authentication, sync endpoint, alert enrollment or UI is enabled by this commit. The migration is not bound to the production Worker or deployment workflow.

## Privacy boundary

Private per-user settings, destinations, sessions and alert events must never be written into site/data.json, state/monitor.json, GitHub artifacts or public logs. The existing monitor is single-recipient and must not be reused for personal accounts without redesign. Keep existing scheduled monitoring unchanged during development.

## Identity and API contract

- Keep guest/local mode and existing saved watchlists working.
- Verify Google identity server-side: signature, issuer, audience, expiry and login nonce. Key identity by verified Google subject, not browser-supplied user IDs or email.
- Implement remembered, revocable sessions; decide same-site hosting versus cross-site browser restrictions before choosing cookie settings. Do not persist bearer credentials in localStorage.
- Authenticate every private read/write and derive user_id from the verified session. D1 foreign keys do not provide row-level authorization.
- Validate symbols, finite positive USD targets, booleans, body size and the 100-entry limit server-side. Reject unknown fields.
- Apply watchlist updates in an atomic transaction with an expected-revision check; return a conflict rather than overwrite another device's edits. Increment revision for every semantic change and target_revision for target or alert-policy changes.
- Default all migrated entries to alerts disabled; show a comparison and require explicit enrollment. A sign-in must not enable notifications.

## Alert implementation gates

- Add private verified notification destinations, user-scoped monitor state, target-versioned events and delivery bookkeeping in later migrations. Do not use repository-wide recipient secrets as destinations for arbitrary accounts.
- Store private alert state outside the public repository. Define safe monitor authentication, pagination, retries and account quotas.
- Recheck current enrollment and target revision before dispatch; invalidate superseded pending events. Define re-arming and in-flight send behaviour. Do not promise exactly-once delivery.
- Saved revision means persisted settings. Applied revision means the monitor loaded those settings; neither proves notification receipt.
- If private settings cannot be fetched, do not silently fall back to a different target for that account.

## Rollout gates

1. Test schema constraints and migrations against local SQLite and D1.
2. Add authenticated API tests, including forged identity, cross-user access, expired sessions, CSRF/origin policy, concurrent edits and validation.
3. Add on-card editing, sync status, sign-out data clearing and explicit local-to-account import. Preserve guest mode.
4. Add private monitor and notification configuration, then mocked end-to-end tests.
5. Configure a Google OAuth web client and separately provision/bind D1 with explicit approval. No credentials belong in source or chat.
6. Review and approve deployment separately; verify mobile layouts, reload persistence and cross-device conflicts. Real notification tests require separate approval.
