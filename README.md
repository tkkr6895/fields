# Fields

Ground notes for maps. Open the app, stand somewhere (or tap the map), say what you see — trees, crops, water, buildings — and optionally check whether satellite maps agree. Those notes train and check land-cover models, Tessera-style species mapping, and CoRE Stack layers.

This repository **is** the app (`https://github.com/tkkr6895/fields`). There is no nested `field-validator-app/` folder.

## On the phone (typical day)

1. Tap **Locate me** or tap the map.
2. Read the card: live satellite cover (Dynamic World), India land cover (CoRE Stack / IndiaSAT), Tessera tile id.
3. Open **Maps** to colour the map. CoRE Stack drainage / water / crop maps load for the tehsil you are in if an API key is set.
4. Tap **+** and record land cover, tree type, a photo, and notes. Checking the maps is optional.
5. Open **Log** → export when you are back online.

No GIS vocabulary is required. Maps are hints; your note is the record.

## Download the APK

GitHub Actions builds a debug APK on every push to `main`.

1. Open [Actions](https://github.com/tkkr6895/fields/actions)
2. Open the latest green **Build Android APK** run
3. Download the `fields-debug` artifact → `app-debug.apk`
4. On the phone, allow installs from unknown sources, then install

In **Settings → Keys & live maps** paste:

- CoRE Stack API key ([request one](https://core-stack.org/use-apis/))
- Earth Engine proxy URL (needed for live Dynamic World and IndiaSAT colouring on the phone)
- Optional Tessera proxy URL (samples embeddings; without it we still save the Tessera tile id)

## What the maps are

| Layer | What it is | On the phone |
| --- | --- | --- |
| Dynamic World | Near-real-time 10 m land cover (Google / WRI) | Live tiles + point class via GEE proxy; Western Ghats offline grid fallback |
| IndiaSAT / CoRE Stack LULC | Annual 30 m India land cover | Live tiles via the same GEE proxy |
| CoRE Stack maps | Drainage, water, crops, villages for the tehsil | WMS after admin lookup (API key) |
| Tessera | 10 m annual Sentinel-1/2 embeddings ([model](https://github.com/ucam-eo/tessera), [species mapping context](https://blog.forestmap.ai/geospatial-foundation-models-a-new-era-for-forest-species-mapping-from-space/)) | Tile id always; 128-d sample only if a Tessera proxy is running. Full tiles are too large to paint globally on a phone. |

Exports include GPS, cover fractions, tree/species text, per-map agreement, Tessera tile id, weather, and photos (GeoAI ZIP / GeoJSON / CSV / STAC).

## Develop

Needs Node 18+.

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
```

```bash
npm run dev          # UI only
npm run dev:full     # UI + Earth Engine proxy + Tessera proxy
```

Earth Engine live data: `earthengine authenticate`, set `GEE_PROJECT` in `.env`. Tessera sampling: `pip install geotessera` (optional; proxy still returns tile ids without it).

```bash
npm run build
npx cap sync android
```

## Documentation

Current docs live in [`docs/README.md`](docs/README.md). Older session notes are in `docs/archive/`.

## License

MIT. See [LICENSE](LICENSE).
