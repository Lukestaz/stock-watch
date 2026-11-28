# Simplicity CI HTTP evidence checkpoint

24 November 2026 NZDT. Prepared for feat/simplicity-freshness-nowcast / PR #6.

The supplied rerun log again shows HTTP 404 HTML responses for all ten public feeds. This does not establish an outdated app observation or prove IP filtering. Earlier external retrieval returned Investment HG CSV content; that retrieval is not equivalent to a successful GitHub runner request or independent production verification.

This CI-only patch preserves the existing ten downloads, URLs, request headers, redirect handling, parser and strict failure exit. It adds requested URLs, the existing Accept/redirect options, selected response headers and a SHA-256 fingerprint of at most the first 1024 error-body bytes. Only fixed keyword markers are reported, not raw HTML, cookies or redirect destinations. Error sample bytes are separate from the existing successful-body bytesRead counter. The sample uses the downloader's existing timeout signal. Markers are clues, not a blocking diagnosis.

Six focused offline Node v20.20.2 tests passed, including successful-body preservation, 404 privacy, sampling limit/cancellation, read failure, redirect privacy and integration guards. Both diagnostic modules passed syntax checks. These are local fixtures, not live network or complete CI results. The copied original diagnostic script matched Git blob dfb835a925ef4b61cf6ef6bcd1694079d1f5d3d1.

No worker, UI, database, release configuration, alert or feed identity changes. No merge or deployment. The historical production verification failure remains unresolved. A commit to the existing PR branch should trigger configured PR checks, but fresh runner evidence must be checked for the actual new revision before claiming success. The existing compact feed-outcome artifact omits these extra fields; inspect the feed-step JSON log for HTTP evidence.

Next: obtain commit approval; inspect a fresh CI result; distinguish request/routing/filtering clues without bypassing access controls or weakening feed checks. If results remain inconclusive, a controlled Node/curl comparison or provider support is a separate next step.
