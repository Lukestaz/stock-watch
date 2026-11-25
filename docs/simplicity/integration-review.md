# Scenario prototype integration review

Reviewed 2026-11-25 NZDT. This is a static integration/scope checkpoint, not merge approval, a full security audit or production-readiness certification.

## Exact revisions and method

- Prototype: 149d17e1d60b26dc3b006594916d0106ce4bef4c.
- Main: b29e56c236dbf65c2e1e577bb9fe668f15bac0f2.
- Shared starting checkpoint in retrieved histories: 05c047ccaafd83c6ddc96f5dc792ffd4f5fc194a.
- Retrieved both histories and every exclusive commit's changed-file list. Six prototype commits affect 24 distinct paths. Main has two newer commits affecting three paths. Their changed-path intersection is empty.
- Main commit 845a702 changes only site/catalog.json; b29e56c changes only site/data.json and state/monitor.json. A future integration must preserve those current-main snapshots rather than replacing main with the older prototype tree.
- Read the current engine, UI, local server, publisher and workflow, plus instructions and handovers. No shared production-entry-point change or source-path collision requiring a functional patch was identified in this limited review.

No Git merge/rebase or merge-tree simulation was executed. Disjoint changed paths do not certify all integration or semantic risks. Recheck refs/diff and actual mergeability before approval to merge.

## Complete prototype changed-path inventory at this checkpoint

- .github/workflows/simplicity-scenario-prototype.yml
- AGENTS.md
- README.md
- config/simplicity/sources.json
- docs/automation-outcomes.md
- docs/simplicity-status.md
- docs/simplicity/design.md
- docs/simplicity/documentation-map.md
- docs/simplicity/project-instructions.md
- docs/simplicity/research.md
- prototypes/simplicity-scenario/README.md
- prototypes/simplicity-scenario/browser.config.mjs
- prototypes/simplicity-scenario/browser.spec.mjs
- prototypes/simplicity-scenario/engine.mjs
- prototypes/simplicity-scenario/engine.test.mjs
- prototypes/simplicity-scenario/index.html
- prototypes/simplicity-scenario/publisher.cjs
- prototypes/simplicity-scenario/publisher.test.mjs
- prototypes/simplicity-scenario/serve.mjs
- prototypes/simplicity-scenario/serve.test.mjs
- prototypes/simplicity-scenario/ui.mjs
- prototypes/simplicity-scenario/verification.json
- prototypes/simplicity-scenario/verify-browser-report.mjs
- prototypes/simplicity-scenario/verify-browser-report.test.mjs

The scope comprises isolated prototype code/tests, one dedicated test/publisher workflow, provisional research records and documentation. It does not change worker/, site/, state/, migrations, release manifests, provider credentials, account/watchlist runtime or alert configuration.

## Independently retrieved execution/publication evidence

Read from ci-results both simplicity-scenario/latest.json and simplicity-scenario/runs/45536528350-1.json. Both returned Git blob 3fe2e2abefeadbe285b2a007342e8828756c75e9 and matched source 149d17e, ref refs/heads/feat/simplicity-scenario-prototype, run 45536528350, attempt 1, run number 2. Recorded at 2026-11-25T02:58:42.353Z. jobResult=success, browserValidation=passed, outcome=passed, passed=14, failed=0, skipped=0, flaky=0. Provenance is trusted-workflow-summary with summaryAvailable=true and summarySourceMatched=true. Whole-workflow conclusion remains null; publication occurred before the publisher finished.

This establishes the test-job result, browser validation and successful automatic record publication/direct retrieval for the exact tested source. It is not live provider/D1, production deployment, trading-price, model-accuracy or whole-workflow-completion evidence. The older c9550fa record remains correctly labelled user-supplied.

## Test and trust boundaries reviewed

Tests use the existing Playwright 1.64.1 pin and require both browser projects with zero retries/skips/flakes. Test/PR jobs are read-only; only exact trusted prototype-branch pushes can publish bounded JSON/Markdown to ci-results. Other folders and immutable run records are retained through non-force updates/conflict retries. Repository-write permission remains job-scoped, not cryptographically confined to the results branch. Publication can be absent after infrastructure/cancellation/permission failure; stale latest is never evidence of current success.

All actual fund inputs remain manual hypothetical assumptions. The runtime catalogue is imported read-only. Unknowns are rejected, not zeroed/normalised. Fixed starting weights, 365-day fee convention and IEEE-754 fee/output arithmetic are prototype limitations, not production NAV validation. Scenarios and official observations/nowcasts remain separate.

## Review disposition and remaining gates

No functional integration patch is proposed from this review. The proposed follow-up is documentation-only. No new account/runtime/browser regressions were run during this review; production entry points are unchanged. Existing source-matched test evidence is identified above, not silently extended to a future commit. The prototype README update matches the existing workflow path filter and will trigger fresh tests/publication after the approved documentation commit.

Proposed PR title (not an opened PR): Add isolated Simplicity scenario prototype and directly retrievable test outcomes.

PR scope should include the provisional all-funds research documents as well as the local scenario lab, tests and results publisher; it must not imply that the initial nine-document inventory exhausts the catalogue or that any extracted parameters are approved. Keep PR #6 release work separate. Before merge, verify current refs/diff and applicable new checks, consider the job-scoped publisher write permission, and retain main's three updated data files. Prototype push publication intentionally remains feature-branch-only; extending main-push publication is a separate policy/approval decision.

No PR creation, merge, rebase, deployment, migration, notification, production feature activation or nowcast availability is authorised by this review.
