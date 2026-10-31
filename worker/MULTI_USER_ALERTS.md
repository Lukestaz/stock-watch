# Multi-user alerts: storage foundation only

This branch does not enable enrolment, change runtime routes or apply migrations. Migration 0005 is an unapplied proposal. Existing API/store enrolment blocks remain. No production data or credentials were accessed.

## Shared provider credentials, private destinations

The owner permits shared provider credentials for friends. Provider credentials remain server-side secrets; never store them in user records, responses, logs or public snapshots. `provider_binding_ref` is an opaque reference to a server-side binding, not a token or API key. Each destination belongs to one account and one channel. Email may use a shared SMTP sender with independently verified recipients. WhatsApp remains unavailable until a supported per-recipient binding or shared application provider exists.

Destinations start unverified and disabled. An address/provider/binding change increments its revision, clears verification and disables it. Only a trusted future verification service may set verified_at after proof of destination control; the timestamp column itself does not perform verification. Existing per-target alerts_enabled/email_enabled/whatsapp_enabled flags remain authoritative additional opt-ins.

Events and delivery records include user, symbol, target revision and observation identity. Delivery keys add the channel. Foreign keys prevent another account's destination from satisfying a delivery reference. These are integrity checks, not row-level authorization: every future API and store operation must derive the user from the authenticated session and bind it in queries. No generic client-supplied user ID or destination is trusted.

## Required before delivery

Implement authenticated destination management, expiring one-time verification challenges, independent channel/target opt-ins, and atomic account-scoped event creation and outbox claims. Immediately before sending, recheck current target/revision, event age, channel consent, destination verification/revision, provider availability and budgets. Do not replay accepted or outcome_unknown deliveries automatically. Claims need lease/recovery semantics; the schema status alone is not a locking or retry implementation. Per-user and global sending budgets are not implemented here.

Add two-user API/store/dispatcher tests, opt-out and destination-change races, target removal/revision tests, duplicate-run/concurrency tests and redacted outcome handling. Keep private destinations and queues out of site/data.json and repository state. Legacy global recipient settings must not be a fallback for account sends. Provider swaps use adapters and may require destination re-verification; targets and preferences stay provider-independent.

Deletion of a target cascades its events/deliveries; account deletion cascades private state. Retention, cancellation and re-enrolment policy require review before dispatch. No exactly-once delivery guarantee is made.

## Local verification

Run `python -m unittest discover -s worker/test -p test_account_alert_schema.py -v`. Nine tests use in-memory SQLite with migration 0001 and the proposed 0005; this is not live D1 verification, the full migration chain, application authorization testing or end-to-end alert delivery. A separately approved migration/deployment is required before production use.
