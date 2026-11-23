import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browserCache) console.log('PLAYWRIGHT_BROWSERS_PATH not set; using Playwright installation defaults');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const Valuation = require('./../dashboard/valuation.js');
const root = process.cwd();
const boardData = JSON.parse(fs.readFileSync(path.join(root, 'output/board.json'), 'utf8'));
const pageUrl = pathToFileURL(path.join(root, 'output/dashboard/index.html')).href;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
const outbound = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (!request.url().startsWith('file:')) outbound.push(request.url());
});

await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForTimeout(100);
const firstText = (await page.locator('body').innerText()).trim();
if (!firstText.includes('Pre-token protocol radar')) throw new Error('board did not render');

await page.locator('#tab-live').click();
await page.waitForTimeout(50);
const liveRows = await page.locator('tbody tr[data-live-slug]').count();
if (liveRows < 1) throw new Error('Live tokens view rendered no real rows');
const liveHeaders = await page.locator('.live-table th').allTextContents();
if (liveHeaders.length !== 6) throw new Error('Live table did not render six headers');
const liveCells = await page.locator('.live-table tbody tr[data-live-slug]').first().locator('td').count();
if (liveCells !== 6) throw new Error('Live table did not render six real cells');
const liveLayout = await page.evaluate(() => {
  const wrap = document.querySelector('.table-wrap');
  const table = document.querySelector('.live-table');
  const last = table ? table.querySelector('tbody tr td:last-child') : null;
  return {
    wrapOverflow: wrap ? wrap.scrollWidth > wrap.clientWidth : true,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    lastRight: last ? last.getBoundingClientRect().right : 0,
  };
});
if (liveLayout.wrapOverflow || liveLayout.pageOverflow || liveLayout.lastRight > 1360) throw new Error('Live table has horizontal overflow');
await page.locator('#q').fill('ethereum');
await page.waitForTimeout(50);
const liveSearchRows = await page.locator('tbody tr[data-live-slug]').count();
if (liveSearchRows < 1) throw new Error('Live search returned no real rows');
await page.locator('#q').fill('');
await page.locator('#chain').selectOption('Ethereum');
await page.waitForTimeout(50);
const liveChainRows = await page.locator('tbody tr[data-live-slug]').count();
if (liveChainRows < 1) throw new Error('Live chain filter returned no real rows');
await page.locator('#chain').selectOption('all');
const liveCategory = await page.evaluate(() => window.RADAR.live.find((row) => row.category)?.category || 'all');
if (liveCategory === 'all') throw new Error('No live category available to test');
await page.locator('#category').selectOption(liveCategory);
await page.waitForTimeout(50);
const liveCategoryRows = await page.locator('tbody tr[data-live-slug]').count();
if (liveCategoryRows < 1) throw new Error('Live category filter returned no real rows');
await page.locator('#category').selectOption('all');
await page.screenshot({ path: path.join(root, 'screenshots/4-live.png'), type: 'png' });
await page.locator('#tab-pre').click();

const search = page.locator('#q');
await search.click();
await search.fill('bridge');
await page.waitForTimeout(100);
const searchFocused = await search.evaluate((node) => document.activeElement === node);
const searchCaret = await search.evaluate((node) => [node.selectionStart, node.selectionEnd]);
if (!searchFocused || searchCaret[0] !== 6) throw new Error('search focus/caret was not preserved');
await search.fill('');

await page.screenshot({ path: path.join(root, 'screenshots/1-board.png'), type: 'png' });

await page.locator('tbody tr').first().click();
await page.waitForTimeout(100);
if (await page.locator('#detail').getAttribute('hidden') !== null) throw new Error('detail did not open');
await page.screenshot({ path: path.join(root, 'screenshots/2-detail.png'), type: 'png' });
await page.locator('#detail .close').click();

await page.locator('tbody tr[data-slug]').first().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
if (await page.locator('#detail').getAttribute('hidden') !== null) throw new Error('Enter did not open detail');
await page.locator('#detail .close').click();
await page.locator('tbody tr[data-slug]').first().focus();
await page.keyboard.press(' ');
await page.waitForTimeout(50);
if (await page.locator('#detail').getAttribute('hidden') !== null) throw new Error('Space did not open detail');
await page.locator('#detail .close').click();

await page.locator('#chain').selectOption('Base');
await page.locator('#category').selectOption('Risk Curators');
await page.locator('#visibility').selectOption('watchlist');
await page.waitForTimeout(100);
const filteredRows = await page.locator('tbody tr[data-slug]').count();
const filterText = (await page.locator('body').innerText()).trim();
if (filteredRows !== 7) throw new Error(`Base/Risk Curators/watchlist expected 7 protocol rows, got ${filteredRows}`);
const selectedChain = await page.locator('#chain').inputValue();
const selectedCategory = await page.locator('#category').inputValue();
const selectedVisibility = await page.locator('#visibility').inputValue();
if (selectedChain !== 'Base' || selectedCategory !== 'Risk Curators' || selectedVisibility !== 'watchlist') {
  throw new Error(`unexpected selected filters: ${selectedChain}/${selectedCategory}/${selectedVisibility}`);
}
if (!filterText.includes('Watchlist')) throw new Error('filter screenshot missing watchlist label');
await page.screenshot({ path: path.join(root, 'screenshots/3-filtered.png'), type: 'png' });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(50);
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
if (!mobileOverflow) throw new Error('mobile layout has horizontal page overflow');

const radar = await page.evaluate(() => window.RADAR);
const preSlugs = new Set(radar.rows.map((row) => row.slug));
const liveSlugs = new Set(radar.live.map((row) => row.slug));
const overlap = [...preSlugs].filter((slug) => liveSlugs.has(slug));
if (overlap.length) throw new Error('pre-token/live overlap: ' + overlap.join(','));
const browserMismatch = await page.evaluate(() => {
  const mismatches = [];
  for (const row of window.RADAR.rows) {
    const calc = window.TokenRadarValuation.calculate({
      model: window.RADAR.model,
      change7d: row.change_7d,
      asOf: window.RADAR.as_of,
      listedAt: row.listed_at,
      tvlUsd: row.tvl_usd,
      comparableRatio: row.comparable_ratio,
    });
    if (calc.implied !== row.implied_value_usd) mismatches.push(row.slug);
  }
  return mismatches;
});
if (browserMismatch.length) throw new Error('Browser recomputation differs for ' + browserMismatch.join(','));
for (const row of boardData.rows) {
  const calc = Valuation.calculate({
    model: radar.model,
    change7d: row.change_7d,
    asOf: radar.as_of,
    listedAt: row.listed_at,
    tvlUsd: row.tvl_usd,
    comparableRatio: row.comparable_ratio,
  });
  if (calc.implied !== row.implied_value_usd) throw new Error('shared recomputation differs for ' + row.slug);
}

await browser.close();

fs.mkdirSync(path.join(root, 'output/screenshots'), { recursive: true });
for (const name of ['1-board.png', '2-detail.png', '3-filtered.png', '4-live.png']) {
  fs.copyFileSync(path.join(root, 'screenshots', name), path.join(root, 'output/screenshots', name));
}

if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join('; '));
if (outbound.length) throw new Error('outbound requests: ' + outbound.join('; '));
console.log('captured board, detail, and filtered states with no page errors or outbound requests');
