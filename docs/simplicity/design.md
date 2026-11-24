# All-funds modelling design (proposed)

## Records

- Fund: internal ID, provider, scheme, legal/display name, NZD currency, catalogue evidence and verified official price-series mapping.
- Source: exact URL, discovery provenance, document kind, portfolio/publication/effective dates, retrieval attempts, raw-content hash, revision and supersession relationships, coverage/exclusions and identity evidence.
- Extraction: source hash, field/value/unit, page or section and quote, extraction method/version, observed/inferred classification, reviewer and review state. Never imply review from extraction success.
- Configuration: fund ID, version, known-from/publication time, effective interval, actual/target allocations, reported classes and separate proxy mapping, policy/observed hedging, fee changes and unresolved assumptions.
- Proxy observation: provider/license, identifier, currency and FX quote convention, return basis, valuation date/cutoff, observed/available-at timestamps and quality flags.
- Model run: model/config versions, verified fund-specific anchor, input observations, calculation timestamp, completed-day/intraday scope, coverage, assumptions, component contributions and unavailable reasons.
- Validation: historical as-known inputs, out-of-sample period, errors, interval coverage and acceptance decisions per fund/horizon.

## Boundaries

AI proposes configurations with evidence. Validation and explicit review precede adoption. Production-facing estimates remain unavailable until allocations, proxies, hedging, valuation cutoffs and out-of-sample performance have been accepted.

Published prices, nowcasts and hypothetical forward scenarios remain distinct datasets. Do not mutate official history or enable alerts from research. Sparse unlisted valuations and missing exposures must remain explicit uncertainties, not assumed daily market returns.

Retain both reported and normalised classifications. Aggregated holdings and their underlying securities must not both contribute to the same exposure. Preserve null separately from zero. Store reported rounded currency statistics without forcing arithmetic agreement.

## Sequence

1. Verify the complete catalogue and source inventory.
2. Define and test extraction schemas against heterogeneous documents.
3. Review dated fund configurations and data-provider access.
4. Implement deterministic offline return calculations and reconciliation.
5. Backtest publication gaps without future disclosure leakage.
6. Consider separately approved app nowcasts; introduce forward scenarios later.

This is a design document, not an implemented runtime schema.
