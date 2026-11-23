// Original snapshot-only model for Token Radar.
// The value is an analytical estimate, not a forecast or a claim that a token will launch.
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const valuation = createRequire(import.meta.url)('../dashboard/valuation.js') as {
  median: (values: number[]) => number | null;
  ageDays: (asOf: string, listedAt: string | null) => number | null;
  calculate: (input: any) => any;
  proof: (snapshot: Snapshot) => any;
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
  full_coverage: any;
  valuation_proof: any;
  canonical_plan_status: string;
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

export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const plan = valuation.buildPlan(p, age);
  return plan.steps;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, fitProof?: any): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p) chosen.set(slug, p);
  }
  const eligible = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  for (const p of eligible.slice(0, snapshot.protocols.length)) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const base = impliedValue(snapshot, p, model);
    let implied = base.implied;
    if (fitProof?.parameters) {
      const selected = valuation.selectedPredict(fitProof.parameters, { category: p.category, tvl_usd: p.tvl_usd, change_7d: p.change_7d, listed_at: p.listed_at });
      implied = Math.max(1, Math.round(selected));
    }
    return { p, v: { ...base, implied }, onWatchlist: watch.has(p.slug) };
  });
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
      `Canonical model: intercept + coefficient × ln(TVL) + growth coefficient × clamp(7d,-60,120)/100 + age coefficient × clamp(age,0,1095)/1095 + shrunken category effect.`,
      `V3 log-size median 3.3987/rank 0.4045; V4 deployed median 3.7627/rank 0.4040. V4 adds active growth/age/category terms without claiming lower error.`,
      `Missing growth is neutral 0; missing age uses 365/1095 for the age feature; residual quantiles are held-out only.`,
    ];
    const caveat = 'No token issuance or future market outcome is inferred. DefiLlama may not have recorded a token; this is an estimate, not an airdrop prediction.';
    const plan = valuation.buildPlan(p, v.age);
    const workflowStatus: 'Observational candidate' | 'Workflow unavailable' =
      plan.status === 'Skip' ? 'Workflow unavailable'
      : plan.status === 'Conditional' ? 'Observational candidate'
      : 'Workflow unavailable';
    const sensitivity = {
      low_usd: Math.max(1, Math.round(v.implied * (fitProof?.bands?.low ?? 0.75))),
      base_usd: v.implied,
      high_usd: Math.max(1, Math.round(v.implied * (fitProof?.bands?.high ?? 1.25))),
      drive: 'Held-out residual 10th/90th ratios supply illustrative bands; they are not confidence intervals or issuance probabilities.',
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
  const proof = valuation.proof(snapshot);
  const board = buildBoard(snapshot, MODEL, proof);
  const watch = new Set(snapshot.watchlist);
  const covered = snapshot.watchlist.filter((slug) => board.some((row) => row.slug === slug)).length;
  const slugs = new Set(board.map((row) => row.slug));
  const protocolSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const coverage = { official: { count: 0, slugs: [] as string[] }, eligible_above_floor: { count: 0, slugs: [] as string[] }, eligible_early: { count: 0, slugs: [] as string[] }, recorded_traded: { count: 0, slugs: [] as string[] }, set_aside: { count: 0, slugs: [] as string[], reasons: {} as Record<string, number> } };
  for (const p of snapshot.protocols) {
    if (watch.has(p.slug)) { coverage.official.count++; coverage.official.slugs.push(p.slug); continue; }
    if (!isPreToken(p)) { coverage.recorded_traded.count++; coverage.recorded_traded.slugs.push(p.slug); continue; }
    if (!isRankable(p)) {
      coverage.set_aside.count++; coverage.set_aside.slugs.push(p.slug);
      let reason = 'derivative_or_other_exclusion';
      if (p.category && ['CEX','Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC'].includes(p.category)) reason = 'blocked_category';
      else if (/\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/.test(p.name)) reason = 'version_marker';
      else if (/\b(receipt|wrapped|staking|staked)\b/.test(p.name.toLowerCase())) reason = 'wrapped_staked_receipt';
      else if (/^w[a-z]{2,}[0-9]*\b/.test(p.name.toLowerCase()) || /^w[a-z]+\b.*(eth|btc|usd)/.test(p.name.toLowerCase())) reason = 'derivative_name';
      coverage.set_aside.reasons[reason] = (coverage.set_aside.reasons[reason] ?? 0) + 1;
      continue;
    }
    if (p.tvl_usd >= snapshot.floor_usd) { coverage.eligible_above_floor.count++; coverage.eligible_above_floor.slugs.push(p.slug); }
    else { coverage.eligible_early.count++; coverage.eligible_early.slugs.push(p.slug); }
  }
  const totalAccounted = coverage.official.count + coverage.eligible_above_floor.count + coverage.eligible_early.count + coverage.recorded_traded.count + coverage.set_aside.count;
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
    comparable_method: 'Canonical TVL/7d/age/category fit trained on traded snapshot peers; live-token records are not ranked as pre-token rows.',
    formula: 'rounded whole-dollar value = round(exp(intercept + log-size coefficient × ln(TVL) + growth coefficient × clamp(7d,-60,120)/100 + age coefficient × clamp(tracking age,0,1095)/1095 + shrunken category effect))',
    coverage: { covered, total: snapshot.watchlist.length, full: covered === snapshot.watchlist.length, watchlist: snapshot.watchlist },
    rows: board,
    live: liveRows(snapshot),
    full_coverage: { total: snapshot.protocols.length, accounted: totalAccounted, unique: new Set([...coverage.official.slugs,...coverage.eligible_above_floor.slugs,...coverage.eligible_early.slugs,...coverage.recorded_traded.slugs,...coverage.set_aside.slugs]).size, full: totalAccounted === snapshot.protocols.length && totalAccounted === protocolSlugs.size, partitions: coverage, no_token_is_not_verified_absence: true },
    valuation_proof: proof,
    canonical_plan_status: 'Scenario control changes planning math only; canonical rank/value remain unchanged.',
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

export function dataScript(radar: RadarData, exportedTriples?: [number, string, number][]): string {
  const full = radar.full_coverage;
  const fp = {
    official: { count: full.partitions.official.count },
    eligible_above_floor: { count: full.partitions.eligible_above_floor.count },
    eligible_early: { count: full.partitions.eligible_early.count },
    recorded_traded: { count: full.partitions.recorded_traded.count },
    set_aside: { count: full.partitions.set_aside.count, reasons: full.partitions.set_aside.reasons },
  };
  const proof = radar.valuation_proof;
  const proofOptions: any = {};
  for (const key of Object.keys(proof.options || {})) {
    const o = proof.options[key];
    proofOptions[key] = { median_multiplicative_error: o.median_multiplicative_error, rank_correlation: o.rank_correlation, n: o.n };
  }
  const proofCompact = {
    peer_count: proof.peer_count,
    peers: proof.peers,
    options: proofOptions,
    selected: proof.selected,
    parameters: proof.parameters ? { beta: proof.parameters.beta, categories: proof.parameters.categories, option: proof.parameters.option, asOf: proof.parameters.asOf, peers: proof.parameters.option?.name === 'v2-category-global-blend-growth-age' ? proof.parameters.peers : undefined } : null,
    held_out: proof.held_out ? { median_multiplicative_error: proof.held_out.median_multiplicative_error, rank_correlation: proof.held_out.rank_correlation, n: proof.held_out.n } : null,
    bands: proof.bands,
    older_to_newer: proof.older_to_newer ? { median_multiplicative_error: proof.older_to_newer.median_multiplicative_error, rank_correlation: proof.older_to_newer.rank_correlation, n: proof.older_to_newer.n } : null,
    newer_to_older: proof.newer_to_older ? { median_multiplicative_error: proof.newer_to_older.median_multiplicative_error, rank_correlation: proof.newer_to_older.rank_correlation, n: proof.newer_to_older.n } : null,
  };
  const compact = {
    as_of: radar.as_of,
    source: radar.source,
    floor_usd: radar.floor_usd,
    model: radar.model,
    model_version: radar.model_version,
    board_size: radar.board_size,
    watchlist_size: radar.watchlist_size,
    early_size: radar.early_size,
    live_size: radar.live_size,
    coverage: radar.coverage,
    full_coverage: { total: full.total, accounted: full.accounted, unique: full.unique, full: full.full, partitions: fp, no_token_is_not_verified_absence: true },
    valuation_proof: proofCompact,
    canonical_plan_status: radar.canonical_plan_status,
    board_triples: exportedTriples ?? radar.rows.map((r) => [r.rank, r.slug, r.implied_value_usd]),
    rows: radar.rows.map((r) => [r.rank,r.slug,r.name,r.category,r.chains,r.tvl_usd,r.change_7d,r.age_days,r.watchlist,r.implied_value_usd,r.comparable_ratio,r.listed_at]),
    live: radar.live.map((r) => [r.slug,r.name,r.category,r.chains,r.tvl_usd,r.mcap_usd,r.change_7d,r.symbol]),
  };
  const packed = gzipSync(Buffer.from(JSON.stringify(compact), 'utf8')).toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < packed.length; i += 100) lines.push(packed.slice(i, i + 100));
  return `window.RADAR_PACKED=[\n${lines.map((line) => `  ${JSON.stringify(line)}`).join(',\n')}\n];\n`;
}
