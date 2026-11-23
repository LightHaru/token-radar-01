(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TokenRadarValuation = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
  function median(values) {
    var clean = values.filter(function (n) { return Number.isFinite(n) && n > 0.01 && n < 100; }).sort(function (a, b) { return a - b; });
    if (!clean.length) return null;
    var middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }
  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    var a = Date.parse(asOf + 'T00:00:00Z'), b = Date.parse(listedAt + 'T00:00:00Z');
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((a - b) / 86400000)) : null;
  }
  function calculate(input) {
    var model = input.model;
    var growth = clamp(input.change7d === null || input.change7d === undefined ? 0 : input.change7d, model.growth_floor, model.growth_cap);
    var growthMultiplier = 1 + (growth / 100) * model.growth_weight;
    var age = ageDays(input.asOf, input.listedAt);
    var ageUsed = age === null ? model.unknown_age_days : age;
    var maturityMultiplier = model.maturity_floor + (clamp(ageUsed, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
    var tvlAnchor = input.tvlUsd * model.tvl_multiple;
    var comparableRatio = input.comparableRatio;
    var comparableAnchor = comparableRatio === null || comparableRatio === undefined ? null : input.tvlUsd * comparableRatio;
    var blend = comparableAnchor === null ? tvlAnchor : tvlAnchor * (1 - model.comparable_blend) + comparableAnchor * model.comparable_blend;
    var implied = Math.max(1, Math.round(blend * growthMultiplier * maturityMultiplier));
    return { age: age, growth: growth, growthMultiplier: growthMultiplier, maturityMultiplier: maturityMultiplier, tvlAnchor: tvlAnchor, comparableAnchor: comparableAnchor, implied: implied };
  }
  return { clamp: clamp, median: median, ageDays: ageDays, calculate: calculate };
}));
