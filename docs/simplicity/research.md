# Simplicity all-funds research log

## 2026-11-24: Initial inventory and scope

Observed in conversation: the user supplied quarterly updates and holdings-map URLs for five KiwiSaver funds and Investment High Growth. Three further Investment fund update URLs were retrieved successfully during discovery. Exact URLs and reported retrieval outcomes are captured in config/simplicity/sources.json.

Evidence limitation: this inventory records earlier conversation tool outcomes, not a new retrieval or page-level audit. It deliberately does not carry forward numerical allocations as approved model inputs. Revalidate complete document contents and capture supporting pages before modelling.

Observed: the supplied KiwiSaver Conservative update filename contains -v2. The Investment Conservative update retrieved at its unsuffixed URL. What changed between revisions remains unknown.

Reported map limitations: High Growth's earlier retrieved page reported a 2025-11-30 portfolio date; Conservative's reported 2026-05-31. The pages excluded cash/cash equivalents and hedging positions. Holdings tables and fund selection require independent verification; a successful page load alone does not establish the requested fund's holdings.

Decision: separate KiwiSaver and Investment identities. Preserve versions and dates. Do not silently merge older holdings detail into newer allocations.

Plan: verify official document catalogues, obtain current SIPOs/PDSs, extract reviewed configurations, choose permitted market/FX data sources, establish valuation conventions, then run historical out-of-sample tests.

Not implemented: automated document ingestion, reviewed allocation records, market-data adapters, numerical nowcasts, prediction intervals or forward forecasts. No deployment or activation is implied by this research bundle.
