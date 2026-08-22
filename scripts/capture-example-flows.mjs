/**
 * Capture phone-framed screenshots for example-flows/.
 * Usage: BASE_URL=http://127.0.0.1:5173 node scripts/capture-example-flows.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const out = process.env.SHOT_DIR || join(root, 'example-flows', 'screenshots');
mkdirSync(out, { recursive: true });

function coreKeyFromEnv() {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    const m = text.match(/^VITE_CORESTACK_API_KEY=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  } catch {
    return '';
  }
}

const AOI = process.env.AOI_PATH || join(root, 'public/data/sample-sulya-aoi.geojson');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SULYA = { lat: 12.561, lon: 75.387 };
const CORE_KEY = process.env.CORESTACK_API_KEY || coreKeyFromEnv();

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(out, `${name}.png`),
    type: 'png',
  });
  console.log('wrote', name);
}

async function dismissOnboarding(page) {
  for (let i = 0; i < 6; i++) {
    const skip = page.getByRole('button', { name: /skip/i });
    if (await skip.count()) {
      await skip.first().click();
      await page.waitForTimeout(200);
    }
    const start = page.getByRole('button', { name: /start mapping/i });
    if (await start.count()) {
      await start.click();
      break;
    }
    const next = page.getByRole('button', { name: /^next$/i });
    if (await next.count()) await next.click();
    else break;
  }
}

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
else launchOpts.channel = 'chrome';
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  geolocation: { latitude: SULYA.lat, longitude: SULYA.lon, accuracy: 12 },
  permissions: ['geolocation'],
  locale: 'en-IN',
  colorScheme: 'dark',
});

const page = await context.newPage();
await page.addInitScript((key) => {
  localStorage.setItem('fields_first_launch_completed', 'true');
  localStorage.setItem('fields_user_name', 'Field trial');
  localStorage.setItem('fields_default_basemap', 'satellite');
  localStorage.setItem('fields_default_center', '75.387, 12.561');
  localStorage.setItem('fields_default_zoom', '13');
  if (key) localStorage.setItem('fields_corestack_api_key', key);
}, CORE_KEY);

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await dismissOnboarding(page);
await page.waitForTimeout(1500);
await shot(page, '01-map-home');

await page.waitForSelector('.app, .bottom-nav, .header-settings', { timeout: 60000 });
await page.getByTitle('Settings').click({ timeout: 15000 });
await page.waitForTimeout(400);
await shot(page, '02-settings-aoi');

const place = page.getByPlaceholder('Sulya, Karnataka');
if (await place.count()) {
  await place.fill('Sulya, Karnataka');
  await page.getByRole('button', { name: /^go$/i }).click();
  await page.waitForTimeout(2500);
}
await shot(page, '03-place-search');

const fileInput = page.locator('input[type="file"][accept*="geojson"]');
if (await fileInput.count()) {
  await fileInput.setInputFiles(AOI);
  await page.waitForTimeout(1200);
}
await shot(page, '04-aoi-imported');

const closeSettings = page.locator('.settings-panel .close-btn');
if (await closeSettings.count()) await closeSettings.click();
await page.waitForTimeout(800);
await shot(page, '05-map-with-aoi');

await page.getByRole('button', { name: /^maps$/i }).click();
await page.waitForTimeout(1800);
await shot(page, '06-maps-panel');

const indiaToggle = page.locator('.overlay-card', { hasText: 'IndiaSAT land cover' }).locator('input[type="checkbox"]');
if (await indiaToggle.count()) {
  await indiaToggle.first().evaluate((el) => el.click());
  await page.waitForTimeout(800);
}
await page.locator('.panel-close').click().catch(() => {});
await page.getByRole('button', { name: /^map$/i }).click().catch(() => {});
await page.waitForTimeout(4500);
await shot(page, '07-indiasat-on');

await page.getByRole('button', { name: /^maps$/i }).click();
await page.waitForTimeout(600);
const tesseraToggle = page.locator('.overlay-card', { hasText: 'Tessera landscape colour' }).locator('input[type="checkbox"]');
if (await tesseraToggle.count()) {
  await tesseraToggle.first().evaluate((el) => el.click());
  await page.waitForTimeout(800);
}
await page.locator('.panel-close').click().catch(() => {});
await page.getByRole('button', { name: /^map$/i }).click().catch(() => {});
await page.waitForTimeout(1800);
await shot(page, '12-tessera-colour');

await page.getByRole('button', { name: /^maps$/i }).click();
await page.waitForTimeout(800);
await shot(page, '13-core-taluk');

await page.locator('.panel-close').click().catch(() => {});
await page.getByRole('button', { name: /^map$/i }).click().catch(() => {});
await page.waitForTimeout(400);

await page.locator('.nav-capture-btn').click({ force: true });
await page.waitForTimeout(800);
await shot(page, '08-quick-capture');

const species = page.getByPlaceholder('Local name or scientific name');
if (await species.count()) {
  await species.fill('Hopea parviflora');
  await page.getByRole('button', { name: /native forest/i }).click().catch(() => {});
}
await shot(page, '09-capture-named');

const save = page.getByRole('button', { name: /save & keep walking/i });
if (await save.count()) await save.click();
await page.waitForTimeout(1200);
await shot(page, '10-saved-toast');

await page.getByRole('button', { name: /^log$/i }).click();
await page.waitForTimeout(800);
await shot(page, '11-field-log');

await browser.close();
console.log('done', out);
