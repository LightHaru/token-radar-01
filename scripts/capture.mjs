import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browserCache) console.log('PLAYWRIGHT_BROWSERS_PATH not set; using Playwright installation defaults');
const { chromium } = createRequire(import.meta.url)('playwright');

const root = process.cwd();
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

await browser.close();

fs.mkdirSync(path.join(root, 'output/screenshots'), { recursive: true });
for (const name of ['1-board.png', '2-detail.png', '3-filtered.png']) {
  fs.copyFileSync(path.join(root, 'screenshots', name), path.join(root, 'output/screenshots', name));
}

if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join('; '));
if (outbound.length) throw new Error('outbound requests: ' + outbound.join('; '));
console.log('captured board, detail, and filtered states with no page errors or outbound requests');
