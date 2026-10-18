# Dashboard browser regression tests

Runs the actual static dashboard through a local HTTP server in Chromium desktop and WebKit with an iPhone viewport. This is not testing on a physical iPhone. No production dashboard code is changed by the test suite.

Browser-context routes replace the monitor feed, catalogue and price endpoint with synthetic fixtures. Other non-local browser requests are blocked and fail the test. No Actions secrets are supplied and no monitor, notification sender or deployment command is executed. Dependency and browser downloads require network access during setup.

## Run

Requires Node 22 and Python 3. From this directory:

```sh
npm install --ignore-scripts --no-audit --no-fund --package-lock=false
npx playwright install --with-deps chromium webkit
npm test
```

Playwright is pinned directly; no dependency lockfile is included, so transitive dependencies are not fully locked. The local server uses port 4173 and refuses to reuse an existing server.

Coverage: saved targets/order after reload, unsaved drafts across data refresh, Replace/Merge/Cancel imports, duplicate-target merge precedence, invalid ticker/negative-target guards, retained quotes after lookup failure, and catalogue listing names. Invalid-input tests deliberately dispatch submit to exercise application validation rather than relying solely on native input constraints.

Chart zoom/date preservation is marked fixme because it is a reported low-priority bug; a skipped test is not evidence it passes. Live provider availability, notification delivery, production deployments and comprehensive visual layout are outside this suite.

## Readable CI outcomes

The browser-test job remains read-only and has no production secrets. A separate publish-summary job runs only for main-branch push/manual events, never PR events. It downloads only this run's JSON artifact, treats it as data, bounds summary text, and uses its own repository-write permission to create/update a dedicated orphan ci-results branch through the GitHub API. No test artifact is executed by the publisher.

Read with the GitHub connector:
- owner: Lukestaz; repo: stock-watch; ref: refs/heads/ci-results
- path: dashboard/latest.json
- historical path: dashboard/runs/<run-id>-<attempt>.json

The branch contains summary JSON only, not a copy of the application. It is not published to Pages and does not trigger alert monitoring. Summaries identify the tested commit/run, job outcome, report availability, counts, browser breakdown, skipped tests and bounded error excerpts. Counts stay null if the report is missing or invalid; setup failures cannot be represented as passing. Older runs cannot replace a newer latest summary.

A missing JSON artifact is tolerated only by the download step so the reporter can record a setup/missing-report failure. Test failures remain failures in the test job; reporter success does not turn the workflow green. A publisher failure, cancellation, runner loss or concurrency cancellation can prevent a summary from being written: always check the stored run ID and timestamp rather than treating an old green summary as current.

GitHub may require permission for Actions to create/update ci-results. If branch rules deny the write, reporting fails visibly; no permission bypass or force push is used. PR runs retain their downloadable artifacts without receiving write credentials. Reports/traces are retained seven days; compact branch summaries persist in Git history. The workflow does not gate Pages publishing.

## Verified baseline

The user-uploaded HTML report for run 39067041186 on c59da57 showed 18 passed, 0 failed, 0 flaky, and 2 intentional skips: nine passes and one chart-selection skip per browser. Test-phase duration was about 23 seconds. baseline.json records that historical evidence; it does not assert future runs pass. The new summary publisher still requires its first CI verification.
