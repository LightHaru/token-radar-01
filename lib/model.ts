// Original snapshot-only model for Token Radar.
// The value is an analytical estimate, not a forecast or a claim that a token will launch.
import { createRequire } from 'node:module';
const valuation = createRequire(import.meta.url)('../dashboard/valuation.js') as {
  median: (values: number[]) => number | null;
  ageDays: (asOf: string, listedAt: string | null) => number | null;
  calculate: (input: any) => any;
};

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  tvl_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  comparable_blend: number;
}

export const MODEL: ModelConstants = {
  tvl_multiple: 0.25,
  growth_weight: 0.35,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.75,
  maturity_range: 0.30,
  maturity_days: 1095,
  unknown_age_days: 365,
  comparable_blend: 0.45,
};

export const MODEL_VERSION = 'radar-2';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  confidence: 'High' | 'Medium' | 'Low';
  comparable_count: number;
  comparable_ratio: number | null;
  evidence: string[];
  assumptions: string[];
  caveat: string;
  workflow_status: 'Observational candidate' | 'Workflow unavailable';
  sensitivity: {
    low_usd: number;
    base_usd: number;
    high_usd: number;
    drive: string;
  };
  model: {
    tvl_multiple: number;
    tvl_anchor_usd: number;
    comparable_anchor_usd: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  confidence: 'High' | 'Medium' | 'Low';
  comparable_count: number;
  comparable_ratio: number | null;
  evidence: string[];
  assumptions: string[];
  caveat: string;
  workflow_status: 'Observational candidate' | 'Workflow unavailable';
  sensitivity: BoardRow['sensitivity'];
  model: BoardRow['model'];
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comparable_method: string;
  formula: string;
  coverage: {
    covered: number;
    total: number;
    full: boolean;
    watchlist: string[];
  };
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

const DAY_MS = 86_400_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  return valuation.ageDays(asOf, listedAt);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const blockedCategories = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
  if (p.category && blockedCategories.has(p.category)) return false;
  const name = p.name.toLowerCase();
  if (VERSIONED.test(p.name)) return false;
  if (/\b(receipt|wrapped|staking|staked)\b/.test(name)) return false;
  if (/^(usdt0|wbtc|binance staked eth|coinbase wrapped steth|wsteth)\b/.test(name)) return false;
  if (/^(w[a-z]+)\b.*(eth|btc|usd)/.test(name)) return false;
  if (/^w[a-z]{2,}[0-9]*\b/.test(name)) return false;
  return true;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function comparableProtocols(snapshot: Snapshot, category: string | null) {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const categoryLive = category ? live.filter((p) => p.category === category) : [];
  const pool = categoryLive.length >= 3 ? categoryLive : live;
  const ratios = pool.map((p) => p.mcap_usd! / p.tvl_usd);
  return { count: pool.length, ratio: valuation.median(ratios) };
}

function ratioRatios(ratios: number[]): number[] {
  // Remove extreme ratios; keep the median robust to a few very large market caps.
  return ratios.filter((r) => r > 0.01 && r < 100);
}

export function impliedValue(snapshot: Snapshot, protocol: SnapshotProtocol, model: ModelConstants = MODEL) {
  const comparable = comparableProtocols(snapshot, protocol.category);
  const calc = valuation.calculate({
    model,
    change7d: protocol.change_7d,
    asOf: snapshot.as_of,
    listedAt: protocol.listed_at,
    tvlUsd: protocol.tvl_usd,
    comparableRatio: comparable.ratio,
  });
  return { implied: calc.implied, age: calc.age, growthPct: calc.growth, growthMult: calc.growthMultiplier, maturityMult: calc.maturityMultiplier, tvlAnchor: calc.tvlAnchor, comparableAnchor: calc.comparableAnchor, comparableCount: comparable.count, comparableRatio: comparable.ratio };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Verify the supported supply, borrow, or collateral workflow in ${name} on ${chain}; check oracle, withdrawal, and liquidation conditions before any transaction.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Verify a documented low-complexity pool or yield workflow in ${name} on ${chain}; inspect pool balance, fees, withdrawal, and impermanent-loss terms.`;
  if (c.includes('bridge')) return `Verify ${name}'s official bridge route to ${chain}; test only a user-selected capped amount and retain both transaction links.`;
  if (c.includes('staking') || c.includes('restak')) return `Verify ${name}'s official supported staking or restaking product on ${chain}; inspect unstaking, slashing, receipt, and redemption terms.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Verify ${name}'s supported margin or derivative workflow on ${chain}; inspect liquidation, funding, oracle, and close paths before action.`;
  if (c.includes('prediction')) return `Verify ${name}'s supported market workflow on ${chain}; inspect resolution, settlement, and cancellation rules before action.`;
  if (c.includes('stable') || c.includes('rwa')) return `Verify ${name}'s supported mint, deposit, or redemption workflow on ${chain}; inspect peg, redemption, custody, and depeg terms.`;
  if (c.includes('insurance')) return `Verify ${name}'s supported cover workflow on ${chain}; inspect covered event, claim, and payout terms before action.`;
  return `Verify ${name}'s official supported deposit or participation workflow on ${chain}; confirm the withdrawal path before any transaction.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const action = actionFor(p, 0, chain).replace('$0 ', '').replace('$0', '');
  const steps = [
    `Verify ${p.name}'s official app and contract on ${chain}; stop if the contract, chain, or support status is unclear. Cost: $0 read-only. Time: 5-10 minutes.`,
    `Confirm a user-supported product matching its recorded category (${p.category ?? 'unreported'}). Cost: $0 read-only. Time: 5-15 minutes.`,
    `${action} If unavailable, skip and make no transaction. Cost: $0 until an optional wallet quote. Time: 10-20 minutes.`,
    `For a voluntary test, use a user-capped budget and verify approval scope, withdrawal, fees, lockups, and smart-contract risks. Cost: wallet gas quote subject to your cap. Time: 10-30 minutes.`,
    `Record the official transaction and status; snapshot metadata establishes no points, cadence, budget, or holding qualification. Cost: $0 read-only. Time: 5 minutes.`,
    `Exit only through the verified interface and check slippage, fees, depeg, bridge, liquidity, and liquidation. Cost: network gas quoted by your wallet. Time: 10-30 minutes.`,
  ];
  return steps;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(snapshot, p, model), onWatchlist: watch.has(p.slug) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || a.p.slug.localeCompare(b.p.slug));

  return scored.map((s, i) => {
    const p = s.p;
    const v = s.v;
    const evidence = [
      `TVL ${formatUsd(p.tvl_usd)} from the snapshot.`,
      `7-day TVL change ${p.change_7d === null ? 'not reported' : `${p.change_7d.toFixed(2)}%`}.`,
      `Tracking age ${v.age === null ? 'unknown' : `${v.age} days`}; snapshot date ${snapshot.as_of}.`,
      `Snapshot records no mcap, CoinGecko id, or symbol for this protocol.`,
    ];
    const confidence: 'High' | 'Medium' | 'Low' =
      p.tvl_usd >= snapshot.floor_usd && v.age !== null && p.change_7d !== null ? 'High'
      : p.tvl_usd >= 25_000_000 && v.age !== null ? 'Medium' : 'Low';
    const assumptions = [
      `Comparable protocols contribute ${(model.comparable_blend * 100).toFixed(0)}% to the estimate through a median market-cap/TVL ratio.`,
      `The remaining blend uses a ${model.tvl_multiple}x TVL anchor, adjusted for growth and an age maturity factor.`,
      `Missing 7-day growth is modeled as 0%; missing age is modeled as ${model.unknown_age_days} days.`,
    ];
    const caveat = 'No token issuance or future market outcome is inferred. DefiLlama may not have recorded a token; this is an estimate, not an airdrop prediction.';
    const workflowStatus: 'Observational candidate' | 'Workflow unavailable' =
      p.category && p.category !== 'CEX' ? 'Observational candidate' : 'Workflow unavailable';
    const sensitivity = {
      low_usd: Math.max(1, Math.round(v.implied * 0.75)),
      base_usd: v.implied,
      high_usd: Math.max(1, Math.round(v.implied * 1.25)),
      drive: 'TVL and comparable market-cap/TVL ratios, 7-day TVL change, and tracking-age maturity drive the band; 25% is a displayed sensitivity range, not a probability.',
    };
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      watchlist: s.onWatchlist,
      age_days: v.age,
      implied_value_usd: v.implied,
      confidence,
      comparable_count: v.comparableCount,
      comparable_ratio: v.comparableRatio,
      evidence,
      assumptions,
      caveat,
      workflow_status: workflowStatus,
      sensitivity,
      model: {
        tvl_multiple: model.tvl_multiple,
        tvl_anchor_usd: Math.round(v.tvlAnchor),
        comparable_anchor_usd: v.comparableAnchor === null ? null : Math.round(v.comparableAnchor),
        growth_pct: round4(v.growthPct),
        growth_multiplier: round4(v.growthMult),
        maturity_multiplier: round4(v.maturityMult),
      },
      farm_steps: farmSteps(p, v.age),
    };
  });
}

function round4(n: number): number { return Math.round(n * 1e4) / 1e4; }
function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString('en-US')}`;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d, symbol: p.symbol }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, MODEL);
  const watch = new Set(snapshot.watchlist);
  const covered = snapshot.watchlist.filter((slug) => board.some((row) => row.slug === slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: liveRows(snapshot).length,
    comparable_method: 'Median live-token market-cap/TVL ratio: category median when at least 3 records exist, otherwise all live-token records. The live set is comparable evidence, not a hardcoded name list.',
    formula: 'rounded whole-dollar value = round(((TVL × 0.25 × 55%) + (TVL × bounded median live mcap/TVL × 45%)) × growth factor × maturity factor)',
    coverage: { covered, total: snapshot.watchlist.length, full: covered === snapshot.watchlist.length, watchlist: snapshot.watchlist },
    rows: board,
    live: liveRows(snapshot),
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || typeof o.source !== 'string') throw new SnapshotError('snapshot.json lacks as_of or source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd)) throw new SnapshotError('snapshot.json lacks floor_usd');
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new SnapshotError('snapshot.json lacks protocols or watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SnapshotError(`snapshot protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') throw new SnapshotError(`snapshot protocol ${i} lacks slug, name, or TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: isFiniteNumber(p.change_7d) ? p.change_7d : null,
      mcap_usd: isFiniteNumber(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist.filter((s): s is string => typeof s === 'string') };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  const protocolSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!protocolSlugs.has(r.slug)) return `invented slug ${r.slug}`;
    if (r.rank !== board.indexOf(r) + 1) return `rank is not 1..N`;
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length) return `board misses ${missing.length} watchlist slugs`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `values are not descending at row ${i + 1}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all values are equal';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `invalid value for ${r.slug}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `invalid farm step count for ${r.slug}`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `invalid farm step length for ${r.slug}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
