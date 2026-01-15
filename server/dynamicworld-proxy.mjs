import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ee from '@google/earthengine';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

    // Try CLI credentials (for development - uses `earthengine authenticate`)
    const cliCreds = await getCliCredentials();
    if (cliCreds) {
      console.log('[GEE] Authenticating via CLI credentials...');
      
      // For OAuth credentials from CLI
      if (cliCreds.refresh_token) {
        ee.data.authenticateViaOauth(
          cliCreds.client_id,
          () => {
            ee.initialize(
              null,
              null,
              () => {
                console.log(`[GEE] Initialized with CLI auth for project: ${GEE_PROJECT}`);
                resolve();
              },
              (err) => reject(err),
              null,
              GEE_PROJECT
            );
          },
          (err) => reject(err),
          null,
          () => cliCreds.refresh_token
        );
        return;
      }
    }

    // Last resort: try default application credentials (gcloud auth)
    console.log('[GEE] Attempting default application credentials...');
    try {
      ee.data.authenticateViaOauth(
        null,
        () => {
          ee.initialize(
            null,
            null,
            () => {
              console.log(`[GEE] Initialized with default credentials for project: ${GEE_PROJECT}`);
              resolve();
            },
            (err) => reject(err),
            null,
            GEE_PROJECT
          );
        },
        (err) => {
          console.error('[GEE] All authentication methods failed');
          reject(new Error('No valid GEE credentials found. Run `earthengine authenticate` or set GEE_SERVICE_ACCOUNT_JSON'));
        }
      );
    } catch (err) {
      reject(new Error('No valid GEE credentials. Run `earthengine authenticate` or set GEE_SERVICE_ACCOUNT_JSON'));
    }
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
  return ee.Image(col.sort('system:time_start', false).first());
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

    const point = ee.Geometry.Point([lon, lat]);
    const image = pickImage(date, point);

    // Dynamic World bands include: label + probability bands.
    const bands = ['label', 'water', 'trees', 'grass', 'flooded_vegetation', 'crops', 'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'];

    const sample = image.select(bands).sample({ region: point, scale: 10, numPixels: 1, geometries: false }).first();
    const dict = ee.Dictionary(sample.toDictionary());

    dict.getInfo((info, err) => {
      if (err) {
        res.status(500).json({ error: String(err) });
        return;
      }
      if (!info) {
        res.status(404).json({ error: 'No Dynamic World sample for this location/date' });
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
    const image = pickImage(date, regionBbox.centroid(1));

    const vis = image
      .select('label')
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
