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
