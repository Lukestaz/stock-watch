# Controlled notification tests

Shared transports live in notifications.py. Importing that module or notification_test.py does not load the monitor, read market data, send messages or modify alert state. The monitor now calls the shared senders; its thresholds, event state, three-attempt policy and existing email subject are unchanged. WhatsApp negative responses such as 'not sent' are rejected rather than accepted merely because they contain 'sent'.

## Offline checks

```sh
python -m unittest discover -s scripts -p test_notifications_unit.py -v
```

All 11 mocked tests passed locally during preparation. The new CI still needs verification after the commit. The workflow automatically runs these secret-free checks on relevant main pushes and PRs. It does not send on pushes or PRs. Monitor syntax compilation does not execute monitor.py.

## Manual live test

Before any live run, privately verify the actual existing channel destination and approve the exact message. Secret presence is not destination verification. Do not paste credentials, addresses or phone numbers into public repository files or logs. If an assistant dispatches a run, obtain its explicit action confirmation for the resolved recipient and message first. Code approval is not send approval.

Actions > Notification checks and manual test > Run workflow > main. Choose exactly one channel and acknowledge confirm_send only after the recipient/message review. No arbitrary-recipient input exists. The send step receives only the selected channel's credentials. This workflow has no Alpaca credentials, never executes the monitor, never deploys, and never reads/writes config/targets.json, state/monitor.json or site/data.json.

Email subject: [TEST] Stock Watch notification check

Fixed body (run ID and attempt identify the actual test):

```text
Stock Watch notification test.
Channel: {email or whatsapp}
Test ID: {run ID}/{attempt}
This is a delivery check, not a price alert. No stock targets or alert state were changed.
```

The test makes at most one sender call. There is no automatic retry. A manual rerun is a new send and requires a fresh approval; run IDs are correlation identifiers, not provider idempotency guarantees. A timeout/disconnect after submission is outcome_unknown because the message may still arrive. Check for receipt before considering another send.

Outcomes: accepted means SMTP/gateway accepted the submission, not proof of delivery; failed means an explicit rejection; not_sent means missing acknowledgement/configuration or a pre-submission failure; outcome_unknown means ambiguous submission/response. A gateway transport error, including HTTP errors with uncertain processing, is conservatively unknown. A late runner failure can prevent the result file from being written.

## Readable results

A separate trusted-main manual-run reporter has repository-write permission and stores allowlisted, sanitised JSON on ci-results, sharing the dashboard reporter's concurrency group to avoid competing writes. It does not execute artifact contents. Contacts, credentials, raw gateway responses and raw exceptions are excluded.

Read notifications/email/latest.json or notifications/whatsapp/latest.json on refs/heads/ci-results. History is notifications/runs/<run-id>-<attempt>.json. These latest files reflect reporter completion order; check run ID/attempt and timestamp rather than assuming a manually rerun older test is newer evidence.

receipt remains unverified until the user independently confirms arrival. No public contact details or automatic claim of delivered is stored. No receipt-confirmation writer is included yet. Missing results are not assumed successful, and reporter success does not override a failed send job. Public summaries do not trigger Pages publishing or alert monitoring.

The scheduled monitor retains its own retry policy and may send normal alerts later; this commit does not manually invoke it. Shared-sender extraction has mocked coverage, not end-to-end proof of scheduled delivery. Live tests and reporter execution remain unverified until explicitly performed.
