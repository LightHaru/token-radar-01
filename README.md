# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/LightHaru/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/LightHaru/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Offline Node entry for the make.fun token-radar-01 bounty.

## Run

Local sealed snapshot:

```sh
mkdir -p output
node main.ts --input /path/to/snapshot.json --output output
```

The grader's default paths are `/input/snapshot.json` and `/output`. Local overrides are supported:

```sh
node main.ts --input /input/snapshot.json --output /output
node main.ts --input /input --output /output
node main.ts --input /path/to/snapshot.json --output /path/to/out
```

## Method

`lib/model.ts` ranks all official watchlist slugs. It may add up to 160 pre-token protocols below the floor that pass metadata credibility checks, excluding clear wrappers, staking products, receipt tokens, CEX records, bridges, liquid staking, versioned subproducts, and names containing wrapping or staking markers.

For each protocol:

1. TVL is valued with a 0.25x anchor.
2. Live-token protocols provide a market-cap/TVL comparable ratio. A category median is used when at least three category comparables exist; otherwise the all-live median is used.
3. The TVL and comparable anchors are blended 55%/45%.
4. A 7-day TVL factor adjusts by `1 + clamp(7-day TVL change in percentage points, -60, 120) * 0.35`. For example, +10 means a 10 percentage-point change, not 10 percent of 10.
5. A maturity factor ranges from 0.75 to 1.05 across 1,095 tracking days. Unknown age uses 365 days.

The result is an explicit implied-value model, not evidence of a future issuance, listing, token allocation, or price. Missing and extreme snapshot fields are handled conservatively. Confidence is derived only from TVL, age, and reported growth.

Each detail shows low/base/high sensitivity bands. They are fixed 25% displayed sensitivity ranges around the base estimate, driven by TVL, comparable market-cap/TVL ratios, 7-day growth, and tracking-age maturity. They are not confidence intervals or probabilities.

## Data provenance

All protocol values come from the supplied immutable snapshot. The snapshot is not copied or vendored into this entry. Its source field identifies the sealed DefiLlama endpoint/fetch. The entry performs no fetches and uses no external assets or services.

Live-token comparables are computed from the snapshot itself. No live protocol is added to the ranked pre-token board; it appears only as comparable evidence or in the reference tab.

## Farm plans

Actions are derived only from category, chain, TVL, and age. They contain no unsupported budget, fee, gas, leverage, weekly qualification, or holding claim. Each plan is an observational checklist: verify a supported product, use only a capped user-selected test amount, and skip when no verified product or workflow is present. The UI and board never promise issuance or rewards.

## Reproduce screenshots

Build the dashboard, then set the environment paths for the provided Playwright installation and browser cache:

```sh
node main.ts --input /path/to/snapshot.json --output output
NODE_PATH=/path/to/node_modules PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node scripts/capture.mjs
```

The capture script uses `pathToFileURL`, verifies search focus/caret, clicks a protocol detail, selects Base / Risk Curators / Watchlist, asserts exactly 7 concrete protocol rows, and asserts no page errors or outbound requests.
