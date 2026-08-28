# Fields

Offline GPS tracks and ground notes. Walk a trail with no signal, drop photos and tags, and optionally check IndiaSAT / Tessera maps when you have coverage.

This repository **is** the app (`https://github.com/tkkr6895/fields`). There is no nested `field-validator-app/` folder.

| I want to… | Go here |
| --- | --- |
| Put it on a phone | [GitHub Actions artifact](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml) · [BUILD_APK.md](./BUILD_APK.md) |
| Walk a field day | [Field loop](#field-loop) below · [example-flows/](./example-flows/) |
| Run it in a browser | [Develop](#develop) |
| Change code | [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) |

## Field loop

1. **Start track.** Red button on the map. The phone records GPS (satellite, plus Wi-Fi/cell if they exist) and draws the line. Keep Fields running; allow **precise location**, and **Allow all the time** if the phone will be in a pocket.
2. **Mark a spot.** Camera button. Photo is optional. Add a tag (tree, water, crop, built, trail), a name if you know it, a line of text. During a track this is a waypoint; without a track it is still a geolocated note.
3. **Maps are optional.** IndiaSAT land-cover colour and Tessera landscape colour live under **Maps**. They need signal and a CoRE key. They never block saving a track or a note.
4. **Share.** Journal → **Share pack**. One zip ready for analysis:

| File | Open in |
| --- | --- |
| `field.geojson` | QGIS / ArcGIS (tracks as lines, notes as points) |
| `tracks.gpx` | Gaia, Google Earth, Garmin |
| `tracks.csv` | Spreadsheet / R / pandas (one GPS fix per row) |
| `observations.csv` | Spreadsheet (one note per row, tags, species, photo id) |
| `images/` | Photos named by the id in the CSV / GeoJSON |
| `README.txt` | Same cheat sheet, inside the zip |

Ground-truthing a model is the same note flow: turn IndiaSAT on when you have signal, photograph the spot, tap Looks right / Wrong class.

## Install on the phone

GitHub always wraps the Actions download in a zip. That is normal. **Do not try to install the zip.**

1. Uninstall older Fields if install fails (“App not installed” is almost always a leftover debug signature).
2. Phone browser: [Actions → Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml) → latest **green** run → **Artifacts** → **Fields**.
3. You get `Fields.zip`. Open it in Files / My Files and **extract**.
4. Tap **Fields.apk** (not `INSTALL.txt`, not the zip).
5. Allow from this source. Play Protect: **Install anyway**.
6. Allow **precise location**. For a phone in a pocket, **Allow all the time**.

Details: [BUILD_APK.md](./BUILD_APK.md).

## What works offline

The APK does not contain the planet. Maps live in **phone storage**:

| On the phone with no signal | Needs coverage |
| --- | --- |
| Streets and Sentinel-2 for places you already viewed or **Save maps** | Sharp Esri aerial (not stored — licence) |
| A small world overview (first launch, ~few MB) | IndiaSAT / CoRE land-cover colour |
| GPS track, notes, tags, photos | Live Tessera colour (packed Sulya preview still works) |
| Bundled Western Ghats forest rasters | Place search, weather, GBIF |
| Share pack (zip is built on-device) | Sending the zip (email / Drive) |

Tap **Save maps** on the screen you will walk. Pan anywhere on Earth while you still have signal and those tiles stay.

## Load areas of interest

**Settings** on the phone (or in the browser):

| Method | What to bring |
| --- | --- |
| **Go to a place** | Type `Sulya, Karnataka`. OpenStreetMap search (needs signal once). |
| **Import file** | GeoJSON, KML/KMZ, or CSV with lat/lon. Stays on this device. Starter: `public/data/sample-sulya-aoi.geojson`. |
| **Default view** | Settings → Map preferences → center (`lon, lat`) and zoom. |

## What the maps are

| Layer | What it is | Needed? |
| --- | --- | --- |
| Your GPS track | Phone GNSS + network, stored locally | Core |
| Notes / photos | Waypoints on or off a track | Core |
| OpenStreetMap streets | Cached on the phone as you pan or via Save maps (ODbL) | Any place you kept |
| Sentinel-2 satellite | Cached EOX cloudless mosaic (Copernicus) | Any place you kept |
| Esri World Imagery | Live only when online | Optional sharpness |
| IndiaSAT / CoRE LULC | Annual ~30 m land cover for the tehsil | Optional, key + signal |
| Tessera colour | One 0.1° RGB fingerprint (bands 30/60/90) | Optional |
| Forest vs plantation | Bundled Western Ghats rasters | Optional, works offline |

No Google Earth Engine. Dynamic World is not used.

## Develop

Needs Node 22+.

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
# optional: VITE_CORESTACK_API_KEY
npm run dev
```

`npm run dev:full` also starts the optional Tessera proxy.

```bash
npm run build
npx cap sync android
```

## Documentation

Current docs live in [`docs/README.md`](docs/README.md). Walkthroughs: [`example-flows/`](example-flows/) (IndiaSAT, Tessera, [offline maps](./example-flows/03-offline-maps.html)).
