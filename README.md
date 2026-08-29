# Fields

Offline-first field app for **GPS tracks** and **ground notes**. Walk without coverage, drop photos and tags, then optionally compare what you saw to IndiaSAT land-cover or Tessera landscape colour when you have a network.

The git repository **is** the app. There is no nested `field-validator-app/` folder. Clone, `npm install`, `npm run dev`.

| Goal | Where |
| --- | --- |
| Run it in a browser | [Develop](#develop) |
| Install on Android | [Releases · sideload](https://github.com/tkkr6895/fields/releases/tag/sideload) · [BUILD_APK.md](./BUILD_APK.md) |
| Understand the product | [Using the app](#using-the-app) · [example-flows/](./example-flows/) |
| Change code | [CONTRIBUTING.md](./CONTRIBUTING.md) · [AGENTS.md](./AGENTS.md) · [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) |

## Using the app

1. **Start track** (red button). The device records GNSS (and network location if available) and draws the line. Keep the app in the foreground, or grant background location if the screen will be off.
2. **Mark a spot** (camera button). A photo is optional. Add a tag (tree, water, crop, built, trail), a name if known, and a short note. During a track this is a waypoint; otherwise it is still a geolocated observation.
3. **Maps are optional.** IndiaSAT class colour and Tessera RGB fingerprints live under **Maps**. They need a network (and a CoRE Stack key for IndiaSAT). They never block saving a track or a note.
4. **Share.** Journal → **Share pack** builds a zip on device:

| File | Typical use |
| --- | --- |
| `field.geojson` | QGIS / ArcGIS (tracks as lines, notes as points) |
| `tracks.gpx` | Gaia, Google Earth, Garmin |
| `tracks.csv` | Spreadsheet / R / pandas (one GPS fix per row) |
| `observations.csv` | Spreadsheet (notes, tags, species, photo id) |
| `images/` | Photos named by the id in the CSV / GeoJSON |
| `README.txt` | Same cheat sheet, inside the zip |

Ground-truthing a model uses the same note flow: turn IndiaSAT on when online, photograph the spot, record whether the class looks right.

## Offline maps

The APK does not contain global imagery. Tiles are stored in the device cache.

| Works with no network | Needs a network |
| --- | --- |
| OpenStreetMap streets and Sentinel-2 for views already seen or saved via **Save maps** | Esri World Imagery (not cached; licence) |
| A small world overview (first launch) | IndiaSAT / CoRE land-cover colour |
| GPS track, notes, tags, photos | Live Tessera colour (a packed Sulya preview is bundled) |
| Bundled Western Ghats forest rasters | Place search, weather, GBIF |
| Share pack (built on device) | Sending the zip |

Pan while online, or tap **Save maps** on the walk before coverage drops. Offline satellite is Sentinel-2 (~10 m). Esri is sharper and live-only.

## Map layers

| Layer | What it is | Required? |
| --- | --- | --- |
| GPS track | Device GNSS + network, stored locally | Core |
| Notes / photos | Waypoints on or off a track | Core |
| OpenStreetMap streets | Cached as you pan or via Save maps (ODbL) | For any saved view |
| Sentinel-2 satellite | Cached EOX cloudless mosaic (Copernicus) | For any saved view |
| Esri World Imagery | Live only | Optional sharpness |
| IndiaSAT / CoRE LULC | Annual ~30 m land cover for the tehsil | Optional; key + network |
| Tessera colour | One 0.1° RGB fingerprint (bands 30/60/90) | Optional |
| Forest vs plantation | Bundled Western Ghats rasters | Optional; works offline |

No Google Earth Engine. Dynamic World is not used.

## Areas of interest

**Settings:**

| Method | Input |
| --- | --- |
| **Go to a place** | Nominatim search (needs network once), e.g. `Sulya, Karnataka` |
| **Import file** | GeoJSON, KML/KMZ, or CSV with lat/lon. Starter: `public/data/sample-sulya-aoi.geojson` |
| **Default view** | Map preferences: center (`lon, lat`) and zoom |

## Develop

Requires Node.js 22+.

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
# optional: VITE_CORESTACK_API_KEY
npm run dev
```

Open http://localhost:5173. `npm run dev:full` also starts the optional Tessera proxy.

```bash
npm run build
npx cap sync android
```

## Android APK

Every push to `main` builds a signed APK:

- Direct download: [Releases · sideload](https://github.com/tkkr6895/fields/releases/tag/sideload) (`Fields.apk`)
- CI artifact: [Actions · Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml) (GitHub wraps artifacts in a zip; extract and install `Fields.apk`)

Local build: [BUILD_APK.md](./BUILD_APK.md). Sideloading requires enabling unknown sources. Grant precise location (background location if recording with the screen off). Installing over an APK signed with a different keystore is rejected by Android; uninstall the previous build in that case.

## Documentation

| Doc | Audience |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | First contribution, repo layout, what not to commit |
| [AGENTS.md](./AGENTS.md) | Short orientation for coding agents |
| [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) | Clone, env, scripts, Android |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Capture vs enrich, map stack |
| [docs/README.md](./docs/README.md) | Index of remaining reference docs |
| [example-flows/](./example-flows/) | IndiaSAT, Tessera, [offline maps](./example-flows/03-offline-maps.html) |
