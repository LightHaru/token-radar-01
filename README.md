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

`lib/model.ts` accounts for all 758 snapshot records exactly once: 40 official watchlist, eligible above-floor off-list, eligible early below-floor, recorded/traded, and set-aside records. It ranks all official watchlist slugs plus every eligible rankable protocol, excluding clear wrappers, staking products, receipt tokens, CEX records, bridges, liquid staking, versioned subproducts, and names containing wrapping or staking markers. “No token recorded” means the snapshot fields are absent, not verified token nonexistence.

For each protocol:

1. Flat TVL and V2 comparable-blend baselines remain in the held-out comparison.
2. One shared fitter compares log-TVL, category-shrinkage, growth, and tracking-age candidate ablations on the same traded peers and leave-one-out folds.
3. Pooled held-out pairs are the source of median multiplicative error and Spearman rank correlation; a true median is used for even pair counts.
4. The selected held-out residual quantiles supply illustrative bands. This is cross-sectional snapshot evidence, not a historical backtest or issuance probability.

The canonical result is selected from held-out peer comparisons, not from prescored values. The same peer records and leave-one-out folds compare flat TVL, the V2 category/global blend with growth and age, log TVL, shrinkage category effects, and growth/age ablations. Selection uses pooled held-out multiplicative error and pooled Spearman correlation. The selected log or categorical fit is applied to every canonical row. Illustrative bands use pooled held-out residual quantiles. The result is an explicit conditional implied-value model, not evidence of a future issuance, listing, token allocation, or price.

Each detail shows fitted terms and illustrative residual bands. The bands come from pooled leave-one-out residual quantiles; they are not confidence intervals or probabilities.

Coverage is computed from `snapshot.watchlist` and the ranked slug set. The snapshot banner must show the resulting covered/total value (the sealed snapshot has 40 official watchlist entries). Pre-token rows mean DefiLlama snapshot fields record no market cap, CoinGecko id, or symbol; it is not proof of tokenlessness.

The selected formula and coefficients are shared by Node and the browser through `dashboard/valuation.js`. Candidate 7-day growth and tracking-age terms use bounded snapshot inputs, but the held-out comparison discloses whether those terms earn their keep.

## Data provenance

All protocol values come from the supplied immutable snapshot. The snapshot is not copied or vendored into this entry. Its source field identifies the sealed DefiLlama endpoint/fetch. The entry performs no fetches and uses no external assets or services.

Live-token comparables are computed from the snapshot itself. No live protocol is added to the ranked pre-token board; it appears only as comparable evidence or in the reference tab.

## Farm plans

Actions are derived only from category and chain evidence visible in the snapshot, plus verifiable protocol names. They contain no unsupported campaign, points, cadence, qualification, allocation or return. The detail accepts capital at risk, fees/gas, elapsed days, an annual opportunity-cost assumption and event probability. Realized reward break-even is fees plus opportunity cost; principal is refundable capital, not a fee. The UI never promises issuance or profit.

## Reproduce screenshots

Build the dashboard, run repository tests, then capture with local environment paths:

```sh
node main.ts --input /path/to/snapshot.json --output output
KIT_DIR=/path/to/kit node scripts/test-model.mjs /path/to/snapshot.json
NODE_PATH=/path/to/node_modules CHROME_BIN=/path/to/chrome node scripts/capture.mjs
```

The capture script verifies offline hydration, search, upper/lower scope selection, plan filtering, scenario rank neutrality, live-view return, exported board triples, peer context, and no page errors or outbound requests.
