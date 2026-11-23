import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../dashboard/valuation.js');

const model = { tvl_multiple: 0.25, growth_weight: 0.35, growth_floor: -60, growth_cap: 120, maturity_floor: 0.75, maturity_range: 0.30, maturity_days: 1095, unknown_age_days: 365, comparable_blend: 0.45 };
function calc(change7d, listedAt = '2024-01-01') {
  return V.calculate({ model, change7d, asOf: '2026-11-14', listedAt, tvlUsd: 100000000, comparableRatio: 1 });
}

if (!(calc(-10).implied < calc(0).implied && calc(0).implied < calc(10).implied)) throw new Error('growth must be monotonic');
if (calc(null).implied !== calc(0).implied) throw new Error('missing growth must equal neutral 0');
if (calc(0, null).age !== null) throw new Error('unknown age handling changed');
if (calc(120).growth !== 120 || calc(-60).growth !== -60 || calc(1000).growth !== 120 || calc(-1000).growth !== -60) throw new Error('growth clamps failed');
if (calc(0, '2020-01-01').maturityMultiplier <= calc(0, '2026-01-01').maturityMultiplier) throw new Error('age scaling failed');
console.log('valuation tests: growth monotonicity, missing 0, age scaling, and clamps pass');
