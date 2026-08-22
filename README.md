# Fields

Ground notes for tree-species mapping and land-cover models. Photograph a tree, name it if you can, and keep walking. IndiaSAT (CoRE Stack), weather, place names, and nearby GBIF plants attach in the background when you have signal. Every note also stores a Tessera tile id so you can join embeddings later on a computer.

This repository **is** the app (`https://github.com/tkkr6895/fields`). There is no nested `field-validator-app/` folder.

| I want to… | Go here |
| --- | --- |
| Run it in 5 minutes | [Develop](#develop) below |
| Walk a field day | [example-flows/](./example-flows/) — [IndiaSAT validation](./example-flows/01-indiasat-validation.html) and [Tessera tree species](./example-flows/02-tessera-tree-species.html) |
| Change code | [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) · [docs/README.md](./docs/README.md) |
| Install on a phone | [BUILD_APK.md](./BUILD_APK.md) |
| Understand APIs | [docs/API_INTEGRATIONS.md](./docs/API_INTEGRATIONS.md) |

## Field loop (tree species)

1. **Before you leave** (wifi is enough): Settings → search a village/taluk, or import GeoJSON / KML / CSV of your plots. They draw on the map. There is no web portal yet.
2. **On site:** Locate me (or tap the tree on the map) → green **+**. The camera opens immediately. Optional: species name, native / plantation / mixed, a one-line note.
3. **Save** writes GPS + photo + Tessera tile id on the phone. The sheet closes. You are not waiting on maps.
4. **When online:** IndiaSAT class, CoRE district/tehsil, weather, and nearby plant names fill in. A yellow dot marks each saved tree.
5. **Share:** Log → export GeoJSON / CSV / GeoAI ZIP (photos included). That is what you send to collaborators or load in QGIS.

Maps are optional colouring. Your photo is the record.

## Load areas of interest without a dashboard

Use **Settings** on the phone (or this browser):

| Method | What to bring |
| --- | --- |
| **Go to a place** | Type `Sulya, Karnataka` (or any village). Uses OpenStreetMap search. |
| **Import file** | GeoJSON, KML/KMZ, or CSV with latitude/longitude columns. Stays in IndexedDB on this device. A starter polygon is in the repo: `public/data/sample-sulya-aoi.geojson`. |
| **Default view** | Settings → Map preferences → default center (`lon, lat`) and zoom. |

Tip: export your plots from Google Earth / QGIS as GeoJSON the night before. One file per landscape is enough.

## Download the APK

GitHub Actions builds a debug APK on every push to `main`.

1. Open [Actions](https://github.com/tkkr6895/fields/actions)
2. Latest green **Build Android APK** → artifact `fields-debug` → `app-debug.apk`

In **Settings** paste a CoRE Stack API key ([request one](https://core-stack.org/use-apis/)). Optional Tessera proxy if you want 128-d samples; tile ids are stored either way.

## What the maps are

| Layer | What it is | On the phone |
| --- | --- | --- |
| IndiaSAT / CoRE Stack LULC | Annual ~30 m India land cover | WMS from CoRE GeoServer for the tehsil you are in (needs API key + coverage) |
| Other CoRE maps | Drainage, water, crops, canopy where generated | Same tehsil lookup |
| Tessera | 10 m Sentinel embeddings | Tile id always; embeddings only if a Tessera proxy is running |
| Forest vs plantation | Bundled Western Ghats rasters | Offline |

No Google Earth Engine. Dynamic World is not used.

## Develop

Needs Node 18+.

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
# put VITE_CORESTACK_API_KEY in .env
npm run dev
```

`npm run dev:full` also starts the optional Tessera proxy.

```bash
npm run build
npx cap sync android
```

## Documentation

Current docs live in [`docs/README.md`](docs/README.md). Walkthroughs with phone screenshots: [`example-flows/`](example-flows/). Older session notes are in `docs/archive/`.

## License

MIT. See [LICENSE](LICENSE).
