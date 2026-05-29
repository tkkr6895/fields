#!/usr/bin/env node
/**
 * pack-indiasat-tiles.mjs
 *
 * Build an offline IndiaSAT raster tile pack for a given year + AOI.
 *
 * Flow:
 *   1. Auth into GEE the same way `server/dynamicworld-proxy.mjs` does
 *      (service account JSON if present, else the local CLI refresh
 *      token at ~/.config/earthengine/credentials).
 *   2. Resolve the yearly IndiaSAT asset (honouring INDIASAT_ASSET_TEMPLATE).
 *   3. Call `ee.Image(id).select(labelBand).visualize(palette).getMap()` to
 *      obtain an XYZ urlFormat hosted by Earth Engine.
 *   4. Tile-walk over the requested bbox + zoom range and download each
 *      tile to `public/tiles/indiasat/<year>/<z>/<x>/<y>.png`.
 *   5. Emit `public/tiles/indiasat/<year>/manifest.json` describing the
 *      pack so the frontend can switch from `IndiaSATService.getLiveTileUrlTemplate`
 *      to cached tiles when offline.
 *
 * USAGE:
 *   node scripts/pack-indiasat-tiles.mjs \
 *     --year 2022 \
 *     --bbox 75.0,12.5,76.0,13.5 \
 *     --minZoom 8 --maxZoom 12
 *   STATUS:
 *   Authoring complete. Uses v4 assets at projects/corestack-trees/assets/LULC_v4/
 *   (verified accessible) with v3 fallback at projects/corestack-datasets/assets/datasets/LULC_v3_river_basin/.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ee from '@google/earthengine';

const GEE_PROJECT = process.env.GEE_PROJECT || '';
const INDIASAT_V4_ROOT = 'projects/corestack-trees/assets/LULC_v4';
const INDIASAT_V3_ROOT = 'projects/corestack-datasets/assets/datasets/LULC_v3_river_basin';
const INDIASAT_ASSET_TEMPLATE = (process.env.INDIASAT_ASSET_TEMPLATE || '').trim();
const INDIASAT_LABEL_BAND_OVERRIDE = (process.env.INDIASAT_LABEL_BAND || '').trim();
// Official palette from CoRE Stack GEE Layers spreadsheet (v4, 14 classes)
const INDIASAT_PALETTE = [
  '#000000', '#ff0000', '#74ccf4', '#1ca3ec', '#0f5e9c',
  '#f1c232', '#38761d', '#A9A9A9', '#BAD93E', '#f59d22',
  '#FF9371', '#b3561d', '#a9a9a9', '#75fd71',
];

function parseArgs(argv) {
  const out = { year: 2022, bbox: null, minZoom: 8, maxZoom: 12, outDir: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--year') { out.year = Number(next); i++; }
    else if (a === '--bbox') { out.bbox = next.split(',').map(Number); i++; }
    else if (a === '--minZoom') { out.minZoom = Number(next); i++; }
    else if (a === '--maxZoom') { out.maxZoom = Number(next); i++; }
    else if (a === '--outDir') { out.outDir = next; i++; }
  }
  if (!out.bbox || out.bbox.length !== 4) throw new Error('--bbox west,south,east,north required');
  if (!Number.isFinite(out.year)) throw new Error('--year required');
  if (out.minZoom > out.maxZoom) throw new Error('--minZoom must be ≤ --maxZoom');
  return out;
}

function deg2num(lon, lat, z) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
  return { x, y };
}

async function initEE() {
  const sa = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (sa) {
    const json = JSON.parse(sa);
    return new Promise((res, rej) => {
      ee.data.authenticateViaPrivateKey(
        json,
        () => ee.initialize(null, null, () => res(), rej, null, GEE_PROJECT),
        rej
      );
    });
  }
  const credPath = path.join(os.homedir(), '.config', 'earthengine', 'credentials');
  const c = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const { OAuth2Client } = await import('google-auth-library');
  const o = new OAuth2Client(c.client_id, c.client_secret);
  o.setCredentials({ refresh_token: c.refresh_token });
  const t = await o.getAccessToken();
  return new Promise((res, rej) => {
    ee.data.setAuthToken(c.client_id, 'Bearer', t.token, 3600, [], () => {
      ee.initialize(null, null, () => res(), rej, null, GEE_PROJECT);
    }, false);
  });
}

async function resolveAsset(year) {
  const candidates = [];
  if (INDIASAT_ASSET_TEMPLATE) candidates.push(INDIASAT_ASSET_TEMPLATE.replace(/\$\{year\}/g, String(year)));
  candidates.push(
    `${INDIASAT_V4_ROOT}/lulc_v4_${year}_${year + 1}`,
    `${INDIASAT_V3_ROOT}/pan_india_lulc_v3_${year}_${year + 1}`,
  );
  for (const id of candidates) {
    try {
      const info = await new Promise((r, rj) => ee.data.getAsset(id, (a, e) => e ? rj(e) : r(a)));
      if (info) return id;
    } catch { /* next */ }
  }
  throw new Error(`Cannot resolve IndiaSAT asset for year ${year}. Set INDIASAT_ASSET_TEMPLATE.`);
}

function pickLabelBand(bandNames) {
  if (INDIASAT_LABEL_BAND_OVERRIDE && bandNames.includes(INDIASAT_LABEL_BAND_OVERRIDE)) return INDIASAT_LABEL_BAND_OVERRIDE;
  const res = [/^(?:predicted_)?lulc$/i, /predicted[_\s-]?(?:label|class|lulc)/i, /label|class(?!\b)/i, /lulc|landcover/i];
  for (const re of res) {
    const h = bandNames.find(b => re.test(b));
    if (h) return h;
  }
  return bandNames[0];
}

async function getMapId(assetId) {
  const img = ee.Image(assetId);
  const bandNames = await new Promise((r, rj) => img.bandNames().evaluate((a, e) => e ? rj(e) : r(a)));
  const label = pickLabelBand(bandNames);
  const vis = img.select(label).visualize({ min: 0, max: 13, palette: INDIASAT_PALETTE });
  return new Promise((r, rj) =>
    vis.getMap({}, (m, e) => e ? rj(new Error(String(e))) : r({ urlFormat: m.urlFormat, mapid: m.mapid, label, bandNames }))
  );
}

async function downloadTile(urlFormat, z, x, y, outPath) {
  const url = urlFormat
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`tile fetch ${z}/${x}/${y} → HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('[pack] args:', args);
  await initEE();
  console.log('[pack] EE initialised, project:', GEE_PROJECT);

  const assetId = await resolveAsset(args.year);
  console.log('[pack] asset:', assetId);

  const { urlFormat, label, bandNames } = await getMapId(assetId);
  console.log('[pack] tile template:', urlFormat);
  console.log('[pack] label band:', label, 'all bands:', bandNames);

  const root = args.outDir || path.join('public', 'tiles', 'indiasat', String(args.year));
  fs.mkdirSync(root, { recursive: true });

  const [w, s, e, n] = args.bbox;
  const summary = { year: args.year, bbox: args.bbox, assetId, labelBand: label, bandNames, zooms: {} };

  for (let z = args.minZoom; z <= args.maxZoom; z++) {
    const tl = deg2num(w, n, z);
    const br = deg2num(e, s, z);
    const xMin = Math.min(tl.x, br.x), xMax = Math.max(tl.x, br.x);
    const yMin = Math.min(tl.y, br.y), yMax = Math.max(tl.y, br.y);
    const count = (xMax - xMin + 1) * (yMax - yMin + 1);
    console.log(`[pack] z=${z} → ${count} tiles  (x:${xMin}-${xMax}, y:${yMin}-${yMax})`);
    let done = 0;
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const out = path.join(root, String(z), String(x), `${y}.png`);
        if (fs.existsSync(out)) { done++; continue; }
        try {
          await downloadTile(urlFormat, z, x, y, out);
          done++;
          if (done % 20 === 0) process.stdout.write(`    ${done}/${count}\r`);
        } catch (err) {
          console.warn(`[pack] tile ${z}/${x}/${y} failed: ${err.message}`);
        }
      }
    }
    summary.zooms[z] = { xMin, xMax, yMin, yMax, count, downloaded: done };
    console.log(`[pack] z=${z} complete: ${done}/${count}`);
  }

  const manifestPath = path.join(root, 'manifest.json');
  summary.urlTemplate = `/tiles/indiasat/${args.year}/{z}/{x}/{y}.png`;
  summary.generatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(summary, null, 2));
  console.log('[pack] manifest written:', manifestPath);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
