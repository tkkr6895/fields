# Fields

Offline GPS tracks and ground notes. Walk a trail with no signal, drop photos and tags, and optionally check IndiaSAT / Tessera maps when you have coverage.

This repository **is** the app (`https://github.com/tkkr6895/fields`). There is no nested `field-validator-app/` folder.

| I want to… | Go here |
| --- | --- |
| Put it on a phone | **[Fields.apk](https://github.com/tkkr6895/fields/releases/tag/sideload)** · [BUILD_APK.md](./BUILD_APK.md) |
| Walk a field day | [Field loop](#field-loop) below · [example-flows/](./example-flows/) |
| Run it in a browser | [Develop](#develop) |
| Change code | [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) |

## Field loop

1. **Start track.** Red button on the map. The phone records GPS (satellite, plus Wi-Fi/cell if they exist) and draws the line. Keep Fields running; allow **precise location**, and **Allow all the time** if the phone will be in a pocket.
2. **Mark a spot.** Camera button. Photo is optional. Add a tag (tree, water, crop, built, trail), a name if you know it, a line of text. During a track this is a waypoint; without a track it is still a geolocated note.
3. **Maps are optional.** IndiaSAT land-cover colour and Tessera landscape colour live under **Maps**. They need signal and a CoRE key. They never block saving a track or a note.
4. **Share.** Journal → **Share pack**. One zip: `tracks.gpx` (Gaia / Google Earth / QGIS), `tracks.geojson`, notes as GeoJSON + CSV, photos.

Ground-truthing a model is the same note flow: turn IndiaSAT on when you have signal, photograph the spot, tap Looks right / Wrong class.

## Install on the phone

Use the **release APK**, not the Actions zip:

1. Uninstall older Fields if install fails (“App not installed” is almost always a leftover debug signature).
2. Download [Fields.apk](https://github.com/tkkr6895/fields/releases/tag/sideload).
3. Open the file → allow from this source → Install. Play Protect: **Install anyway**.

Details: [BUILD_APK.md](./BUILD_APK.md).

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

Current docs live in [`docs/README.md`](docs/README.md). Walkthroughs: [`example-flows/`](example-flows/).
