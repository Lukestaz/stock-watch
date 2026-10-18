# Notification unit CI reporting

The Notification unit tests workflow runs the existing mocked sender suite and compiles monitor.py without executing it. It has no production secrets and never invokes the monitor, live test workflow, deployment or notification sender outside the mocks. Socket connections are blocked while the suite executes.

A dedicated JSON runner preserves counts on test failures and treats zero discovered tests as failure. It records a separate monitor syntax check. Failure summaries contain test identifiers and categories, not raw provider responses or credential values. Reports are scoped to the tested commit and exact run/attempt.

Trusted main-branch push/manual runs publish through a separate write-enabled job to ci-results:

- notifications/unit/latest.json
- notifications/unit/runs/<run-id>-<attempt>.json

These paths are distinct from notifications/email/latest.json and notifications/whatsapp/latest.json, which represent manual live-message outcomes. A passing unit summary is not evidence a real message was sent or delivered.

PR runs retain read-only test jobs and downloadable JSON artifacts; they cannot publish branch summaries. The reporter parses and allowlists data without executing artifacts, uses the shared dashboard-results-publisher lock, and never force pushes. Older unit runs cannot overwrite a newer latest summary. Missing/invalid reports have null counts and cannot pass. A setup failure can therefore be reported even when Python tests never started.

The earlier Notification checks and manual test workflow keeps its own mocked pre-send checks. Relevant changes may therefore run the small unit suite in both workflows; the dedicated unit workflow supplies the connector-readable automated result without changing live-send behaviour.

Artifacts expire after seven days; compact summaries remain in Git history. Cancellation, runner loss or reporting permission failures can prevent a new summary, so verify run ID, tested commit and timestamp rather than trusting an old green result. Reporter success does not override a failed unit-test job. No Pages publish or alert-monitor run is triggered by these summary writes.

Local runner pass/fail JSON behaviour was checked with synthetic cases during preparation; that is not a new full-suite CI pass. The first run after this patch must verify the actual suite and repository publishing.

Local use:

```sh
python tests/notifications/run_unit_tests.py --output /tmp/notification-unit-results.json
```
