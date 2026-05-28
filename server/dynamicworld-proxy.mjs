import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ee from '@google/earthengine';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Catch unhandled errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
});
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err);
});

const execAsync = promisify(exec);
const PORT = Number(process.env.PORT || 8787);

// Target GEE project for all operations (set in .env)
const GEE_PROJECT = process.env.GEE_PROJECT || '';

const DW_CLASS_NAMES = {
  0: 'Water',
  1: 'Trees',
  2: 'Grass',
  3: 'Flooded Vegetation',
  4: 'Crops',
  5: 'Shrub and Scrub',
  6: 'Built',
  7: 'Bare',
  8: 'Snow and Ice'
};

const DW_PALETTE = [
  '#419BDF', // Water
  '#397D49', // Trees
  '#88B053', // Grass
  '#7A87C6', // Flooded
  '#E49635', // Crops
  '#DFC35A', // Shrub
  '#C4281B', // Built
  '#A59B8F', // Bare
  '#B39FE1'  // Snow
];

// IndiaSAT LULC classes (core-stack.org IndiaSAT pipeline)
// Asset: projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/
// Hydrological years 2017-2022, 30m resolution, annual.
const INDIASAT_CLASS_NAMES = {
  0: 'Background',
  1: 'Built up',
  2: 'Kharif water',
  3: 'Kharif + Rabi water',
  4: 'Kharif + Rabi + Zaid water',
  5: 'Crops',
  6: 'Trees / Forest',
  7: 'Barren land',
  8: 'Single Kharif cropping',
  9: 'Single Non-Kharif cropping',
  10: 'Double cropping',
  11: 'Triple / Perennial cropping',
  12: 'Shrubs / Scrubs'
};
// Palette inspired by IndiaSAT visualisation conventions (built-red, water-blues, vegetation-greens, crop-ambers).
const INDIASAT_PALETTE = [
  '#000000', // 0  Background (transparent in viz)
  '#C4281B', // 1  Built up
  '#5DADE2', // 2  Kharif water
  '#2E86C1', // 3  Kharif + Rabi water
  '#1B4F72', // 4  Perennial water
  '#E49635', // 5  Crops (generic)
  '#1E6E2E', // 6  Trees / Forest
  '#A59B8F', // 7  Barren land
  '#F4D03F', // 8  Single Kharif
  '#F1C40F', // 9  Single Non-Kharif
  '#D68910', // 10 Double cropping
  '#7E5109', // 11 Triple / Perennial cropping
  '#DFC35A'  // 12 Shrubs / Scrubs
];
const INDIASAT_ASSET_FOLDER = 'projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence';
const INDIASAT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022];

// Optional operator overrides — if the IndiaSAT folder is granted to your
// project later (or if you have your own mirror), you can pin the exact path
// + band names without changing code. See PENDING_ISSUES.md issue #14.
//   INDIASAT_ASSET_TEMPLATE  e.g. "projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/LULC_${year}"
//   INDIASAT_LABEL_BAND      e.g. "predicted_label"
//   INDIASAT_CONF_BAND       e.g. "confidence"
const INDIASAT_ASSET_TEMPLATE = (process.env.INDIASAT_ASSET_TEMPLATE || '').trim();
const INDIASAT_LABEL_BAND_OVERRIDE = (process.env.INDIASAT_LABEL_BAND || '').trim();
const INDIASAT_CONF_BAND_OVERRIDE = (process.env.INDIASAT_CONF_BAND || '').trim();

// Resolved per-year image IDs cached after first successful asset listing.
const indiasatYearAssetCache = new Map();
// Resolved (labelBand, confBand) cached after first successful introspection.
const indiasatBandCache = new Map();

async function resolveIndiaSATAsset(year) {
  if (indiasatYearAssetCache.has(year)) return indiasatYearAssetCache.get(year);
  // If operator pinned a template, honour it first.
  const candidates = [];
  if (INDIASAT_ASSET_TEMPLATE) {
    candidates.push(INDIASAT_ASSET_TEMPLATE.replace(/\$\{year\}/g, String(year)));
  }
  // Common naming conventions seen in CoRE Stack docs + IndiaSAT scripts.
  candidates.push(
    `${INDIASAT_ASSET_FOLDER}/${year}`,
    `${INDIASAT_ASSET_FOLDER}/LULC_${year}`,
    `${INDIASAT_ASSET_FOLDER}/lulc_${year}`,
    `${INDIASAT_ASSET_FOLDER}/India_${year}`,
    `${INDIASAT_ASSET_FOLDER}/${year}_LULC`,
    `${INDIASAT_ASSET_FOLDER}/LULC_${year}_${(year + 1) % 100}`,  // e.g. LULC_2022_23
    `${INDIASAT_ASSET_FOLDER}/${year}_${(year + 1) % 100}`,        // e.g. 2022_23
  );
  let lastErr = null;
  for (const id of candidates) {
    try {
      const info = await new Promise((res, rej) =>
        ee.data.getAsset(id, (a, e) => (e ? rej(e) : res(a)))
      );
      if (info) {
        console.log(`[IndiaSAT] resolved year ${year} → ${id} (type=${info.type})`);
        indiasatYearAssetCache.set(year, id);
        return id;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // Fallback: list children of folder and look for a match containing the year.
  try {
    const listing = await new Promise((res, rej) =>
      ee.data.listAssets({ parent: INDIASAT_ASSET_FOLDER }, {}, (a, e) => (e ? rej(e) : res(a)))
    );
    const assets = listing?.assets || [];
    const match = assets.find(a => String(a.id || a.name || '').includes(String(year)));
    if (match) {
      const id = match.id || match.name;
      console.log(`[IndiaSAT] resolved year ${year} via listAssets → ${id}`);
      indiasatYearAssetCache.set(year, id);
      return id;
    }
  } catch (err) {
    lastErr = err;
    console.warn('[IndiaSAT] listAssets failed:', err.message);
  }
  // Build a richer error that distinguishes "no access" from "no asset".
  const errMsg = String(lastErr?.message || lastErr || '');
  const isPermission = /does not exist or (?:doesn|caller does not have access)/i.test(errMsg);
  const hint = isPermission
    ? `The IndiaSAT asset folder is not readable by this GEE project. Ask the IndiaSAT team to share read access with your service account / project, or set INDIASAT_ASSET_TEMPLATE to your own mirror.`
    : `Set INDIASAT_ASSET_TEMPLATE to the exact yearly asset path, e.g. INDIASAT_ASSET_TEMPLATE="${INDIASAT_ASSET_FOLDER}/LULC_\${year}".`;
  throw new Error(`IndiaSAT asset for year ${year} not resolvable. ${hint} (last error: ${errMsg || 'none'})`);
}

/** Build an EE image for a given year, detecting label + confidence bands. */
async function indiasatImageForYear(year) {
  const assetId = await resolveIndiaSATAsset(year);
  // Asset may be Image or ImageCollection — handle both.
  let img;
  try {
    img = ee.Image(assetId);
  } catch {
    img = ee.ImageCollection(assetId).mosaic();
  }
  return { image: img, assetId };
}

function pickIndiaSATBands(bandNames) {
  const cacheKey = bandNames.join('|');
  if (indiasatBandCache.has(cacheKey)) return indiasatBandCache.get(cacheKey);
  // 1. Honour explicit operator overrides.
  let labelBand = INDIASAT_LABEL_BAND_OVERRIDE && bandNames.includes(INDIASAT_LABEL_BAND_OVERRIDE)
    ? INDIASAT_LABEL_BAND_OVERRIDE
    : null;
  let confBand = INDIASAT_CONF_BAND_OVERRIDE && bandNames.includes(INDIASAT_CONF_BAND_OVERRIDE)
    ? INDIASAT_CONF_BAND_OVERRIDE
    : null;
  // 2. Score candidates by pattern strength (most-specific first).
  const labelPatterns = [
    /^(?:predicted_)?lulc$/i,
    /predicted[_\s-]?(?:label|class|lulc)/i,
    /classification|classified/i,
    /label|class(?!\b)/i,
    /lulc|landcover|landuse|category|cluster/i,
  ];
  const confPatterns = [
    /^confidence$/i,
    /confidence|probab|prob_score/i,
    /score|prob/i,
  ];
  if (!labelBand) {
    for (const re of labelPatterns) {
      const hit = bandNames.find(b => re.test(b));
      if (hit) { labelBand = hit; break; }
    }
    if (!labelBand) labelBand = bandNames[0];
  }
  if (!confBand) {
    for (const re of confPatterns) {
      const hit = bandNames.find(b => b !== labelBand && re.test(b));
      if (hit) { confBand = hit; break; }
    }
    // Fall back: if there's exactly two bands and we picked the label, the other is likely confidence.
    if (!confBand && bandNames.length === 2) {
      confBand = bandNames.find(b => b !== labelBand) || null;
    }
  }
  const out = { labelBand, confBand };
  indiasatBandCache.set(cacheKey, out);
  console.log(`[IndiaSAT] bandNames=${JSON.stringify(bandNames)} → label="${labelBand}" conf="${confBand || '(none)'}"`);
  return out;
}

function parseServiceAccountJson() {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // allow users to paste JSON with newlines/spaces
    return JSON.parse(raw.replace(/\n/g, '\\n'));
  }
}

/**
 * Try to read credentials from earthengine CLI config
 */
async function getCliCredentials() {
  try {
    // Check common credential locations
    const homeDir = os.homedir();
    const credPaths = [
      path.join(homeDir, '.config', 'earthengine', 'credentials'),
      path.join(homeDir, '.earthengine', 'credentials'),
      path.join(process.env.APPDATA || '', 'earthengine', 'credentials'),
    ];
    
    for (const credPath of credPaths) {
      if (fs.existsSync(credPath)) {
        const content = fs.readFileSync(credPath, 'utf-8');
        const creds = JSON.parse(content);
        console.log(`[GEE] Found CLI credentials at: ${credPath}`);
        return creds;
      }
    }
    
    return null;
  } catch (err) {
    console.warn('[GEE] Failed to read CLI credentials:', err.message);
    return null;
  }
}

let eeReadyPromise;
function ensureEarthEngine() {
  if (eeReadyPromise) return eeReadyPromise;

  eeReadyPromise = new Promise(async (resolve, reject) => {
    // First try service account JSON (for production)
    const key = parseServiceAccountJson();
    if (key) {
      console.log('[GEE] Authenticating via service account...');
      ee.data.authenticateViaPrivateKey(
        key,
        () => {
          ee.initialize(
            null,
            null,
            () => {
              console.log(`[GEE] Initialized with service account for project: ${GEE_PROJECT}`);
              resolve();
            },
            (err) => reject(err)
          );
        },
        (err) => reject(err)
      );
      return;
    }

    // For CLI / gcloud ADC credentials, use google-auth-library to get an access token,
    // then pass it to EE via ee.data.setAuthToken (avoids the browser-only authenticateViaOauth).
    const credSources = [];
    
    // 1. EE CLI credentials
    const cliCreds = await getCliCredentials();
    if (cliCreds?.refresh_token && cliCreds?.client_id) {
      credSources.push({ label: 'EE CLI', ...cliCreds });
    }
    
    // 2. gcloud Application Default Credentials
    const adcPath = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'gcloud', 'application_default_credentials.json');
    if (fs.existsSync(adcPath)) {
      try {
        const adcCreds = JSON.parse(fs.readFileSync(adcPath, 'utf-8'));
        if (adcCreds.refresh_token && adcCreds.client_id) {
          credSources.push({ label: 'gcloud ADC', ...adcCreds });
        }
      } catch (adcErr) {
        console.warn('[GEE] Failed to read gcloud ADC:', adcErr.message);
      }
    }

    for (const cred of credSources) {
      try {
        console.log(`[GEE] Authenticating via ${cred.label} (refresh token → access token)...`);
        
        // Use google-auth-library to exchange refresh token for access token
        const { OAuth2Client } = await import('google-auth-library');
        const oauth2Client = new OAuth2Client(cred.client_id, cred.client_secret);
        oauth2Client.setCredentials({ refresh_token: cred.refresh_token });
        
        const tokenResponse = await oauth2Client.getAccessToken();
        const accessToken = tokenResponse.token;
        
        if (!accessToken) {
          console.warn(`[GEE] ${cred.label}: Failed to get access token`);
          continue;
        }
        
        console.log(`[GEE] Got access token via ${cred.label}, initializing EE...`);
        
        // Set the auth token directly (works in Node.js without browser DOM)
        ee.data.setAuthToken(
          cred.client_id,
          'Bearer',
          accessToken,
          3600, // expires in seconds
          [],   // extra scopes
          () => {
            ee.initialize(
              null,
              null,
              () => {
                console.log(`[GEE] ✓ Initialized with ${cred.label} for project: ${GEE_PROJECT}`);
                
                // Set up token refresh
                ee.data.setAuthTokenRefresher(async (authArgs, callback) => {
                  try {
                    const refreshed = await oauth2Client.getAccessToken();
                    callback({
                      access_token: refreshed.token,
                      token_type: 'Bearer',
                      expires_in: 3600,
                    });
                  } catch (refreshErr) {
                    callback({ error: refreshErr.message });
                  }
                });
                
                resolve();
              },
              (err) => reject(err),
              null,
              GEE_PROJECT
            );
          },
          false // not a service account
        );
        return; // success — stop trying other cred sources
      } catch (authErr) {
        console.warn(`[GEE] ${cred.label} auth failed:`, authErr.message);
      }
    }

    // If we get here, all credential sources failed
    console.error('[GEE] All authentication methods failed');
    reject(new Error('No valid GEE credentials. Run `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/earthengine,https://www.googleapis.com/auth/devstorage.full_control,https://www.googleapis.com/auth/cloud-platform` or set GEE_SERVICE_ACCOUNT_JSON'));
  });

  return eeReadyPromise;
}

function pickImage(dateStr, point) {
  let col = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(point);
  if (dateStr) {
    // Use a 32-day window centered on the provided date.
    const d = ee.Date(dateStr);
    col = col.filterDate(d.advance(-16, 'day'), d.advance(16, 'day'));
  }
  // Return collection (caller decides how to reduce)
  return col;
}

/**
 * Returns result for a DW point query. Tries provided date, then falls back to
 * progressively wider windows until data is found.
 */
function queryPointData(lat, lon, dateStr) {
  return new Promise((resolve, reject) => {
    const point = ee.Geometry.Point([lon, lat]);
    const bands = ['label', 'water', 'trees', 'grass', 'flooded_vegetation', 'crops', 'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'];

    let col = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(point);

    if (dateStr) {
      const d = ee.Date(dateStr);
      col = col.filterDate(d.advance(-16, 'day'), d.advance(16, 'day'));
    } else {
      // Default: last 365 days (DW can have months of latency)
      const now = ee.Date(Date.now());
      col = col.filterDate(now.advance(-365, 'day'), now);
    }

    // First check if collection has data
    col.size().getInfo((size, sizeErr) => {
      if (sizeErr) return reject(sizeErr);
      if (!size || size === 0) return resolve(null);

      // Use mosaic of most-recent images so we get coverage even if 
      // the single latest scene doesn't include this point
      const image = col.sort('system:time_start', false).mosaic();
      
      // Use reduceRegion — more reliable for single points than sample()
      const dict = image.select(bands).reduceRegion({
        reducer: ee.Reducer.first(),
        geometry: point,
        scale: 10,
        bestEffort: true,
      });
      
      dict.getInfo((info, err) => {
        if (err) return reject(err);
        // Check if we got actual values (not all nulls)
        if (!info || info.label === null || info.label === undefined) return resolve(null);
        resolve(info);
      });
    });
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', async (_req, res) => {
  try {
    await ensureEarthEngine();
    res.json({ ok: true, ee: 'ready' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Point query: returns label + per-class probabilities (0..1)
app.get('/dynamicworld/point', async (req, res) => {
  try {
    await ensureEarthEngine();

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'lat/lon required' });
      return;
    }

    const info = await queryPointData(lat, lon, date);

    if (!info) {
      res.status(404).json({ error: 'No Dynamic World data for this location/date range' });
      return;
    }

    const label = Number(info.label);
    const probs = {
      Water: Number(info.water ?? 0),
      Trees: Number(info.trees ?? 0),
      Grass: Number(info.grass ?? 0),
      'Flooded Vegetation': Number(info.flooded_vegetation ?? 0),
      Crops: Number(info.crops ?? 0),
      'Shrub and Scrub': Number(info.shrub_and_scrub ?? 0),
      Built: Number(info.built ?? 0),
      Bare: Number(info.bare ?? 0),
      'Snow and Ice': Number(info.snow_and_ice ?? 0)
    };

    const entries = Object.entries(probs).sort((a, b) => b[1] - a[1]);
    const top = entries[0] || ['Unknown', 0];

    res.json({
      lat,
      lon,
      date: date || null,
      landCoverClass: DW_CLASS_NAMES[label] || top[0],
      confidence: Number(top[1] || 0),
      probabilities: probs,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Map tiles: returns an EE mapid+token and a ready-to-use urlFormat
app.get('/dynamicworld/mapid', async (req, res) => {
  try {
    await ensureEarthEngine();

    const date = typeof req.query.date === 'string' ? req.query.date : undefined;

    const regionBbox = ee.Geometry.Rectangle([72.5, 8.0, 78.5, 21.5]);
    let col = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
      .filterBounds(regionBbox);
    
    if (date) {
      const d = ee.Date(date);
      col = col.filterDate(d.advance(-16, 'day'), d.advance(16, 'day'));
    } else {
      const now = ee.Date(Date.now());
      col = col.filterDate(now.advance(-365, 'day'), now);
    }
    
    // Use mode composite for the map view
    const image = col.select('label').mode().clip(regionBbox);

    const vis = image
      .visualize({ min: 0, max: 8, palette: DW_PALETTE });

    vis.getMap({}, (map, err) => {
      if (err) {
        res.status(500).json({ error: String(err) });
        return;
      }
      res.json({
        mapid: map.mapid,
        token: map.token,
        urlFormat: map.urlFormat,
        palette: DW_PALETTE,
        classes: DW_CLASS_NAMES,
        note: 'Use urlFormat directly as an XYZ template in MapLibre.'
      });
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[dynamicworld-proxy] listening on http://localhost:${PORT}`);
  console.log('[dynamicworld-proxy] set GEE_SERVICE_ACCOUNT_JSON to enable Earth Engine');
});

// ─── IndiaSAT LULC endpoints ────────────────────────────────────────────────

// List available IndiaSAT years and class metadata
app.get('/indiasat/meta', (_req, res) => {
  res.json({
    asset: INDIASAT_ASSET_FOLDER,
    years: INDIASAT_YEARS,
    classes: INDIASAT_CLASS_NAMES,
    palette: INDIASAT_PALETTE,
    resolution_m: 30,
    temporal: 'annual (hydrological year)',
    citation: 'Sahasranaman et al. (2024). IndiaSAT LULC, projects/ee-indiasat. https://core-stack.org/lulc/'
  });
});

// Point query: returns class label + confidence (if available)
app.get('/indiasat/point', async (req, res) => {
  try {
    await ensureEarthEngine();
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const year = req.query.year ? Number(req.query.year) : INDIASAT_YEARS[INDIASAT_YEARS.length - 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'lat/lon required' });
      return;
    }
    if (!INDIASAT_YEARS.includes(year)) {
      res.status(400).json({ error: `Unsupported year ${year}. Available: ${INDIASAT_YEARS.join(',')}` });
      return;
    }

    const { image, assetId } = await indiasatImageForYear(year);
    const bandNames = await new Promise((resolve, reject) =>
      image.bandNames().getInfo((n, e) => (e ? reject(e) : resolve(n)))
    );
    const { labelBand, confBand } = pickIndiaSATBands(bandNames);

    const point = ee.Geometry.Point([lon, lat]);
    const selected = confBand ? image.select([labelBand, confBand]) : image.select([labelBand]);
    const sampled = await new Promise((resolve, reject) => {
      selected.reduceRegion({
        reducer: ee.Reducer.first(),
        geometry: point,
        scale: 30,
        bestEffort: true,
      }).getInfo((info, err) => (err ? reject(err) : resolve(info)));
    });

    const rawLabel = sampled?.[labelBand];
    if (rawLabel === null || rawLabel === undefined) {
      res.status(404).json({ error: 'No IndiaSAT data at this location for year', year, assetId });
      return;
    }
    const labelInt = Math.round(Number(rawLabel));
    const className = INDIASAT_CLASS_NAMES[labelInt] ?? `Class ${labelInt}`;
    const confidence = confBand && sampled?.[confBand] != null ? Number(sampled[confBand]) : null;

    res.json({
      lat,
      lon,
      year,
      assetId,
      band: labelBand,
      confidenceBand: confBand || null,
      classId: labelInt,
      landCoverClass: className,
      confidence,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Map tiles for a given year
app.get('/indiasat/mapid', async (req, res) => {
  try {
    await ensureEarthEngine();
    const year = req.query.year ? Number(req.query.year) : INDIASAT_YEARS[INDIASAT_YEARS.length - 1];
    if (!INDIASAT_YEARS.includes(year)) {
      res.status(400).json({ error: `Unsupported year ${year}` });
      return;
    }
    const { image, assetId } = await indiasatImageForYear(year);
    const bandNames = await new Promise((resolve, reject) =>
      image.bandNames().getInfo((n, e) => (e ? reject(e) : resolve(n)))
    );
    const { labelBand } = pickIndiaSATBands(bandNames);
    const vis = image.select(labelBand).visualize({ min: 0, max: 12, palette: INDIASAT_PALETTE });
    vis.getMap({}, (map, err) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.json({
        mapid: map.mapid,
        token: map.token,
        urlFormat: map.urlFormat,
        palette: INDIASAT_PALETTE,
        classes: INDIASAT_CLASS_NAMES,
        year,
        assetId,
        band: labelBand
      });
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});