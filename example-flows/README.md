# Example flows

Phone-shaped screenshots from the live Fields app (390×844, satellite basemap, Sulya, Karnataka). Open any PNG in `screenshots/` at 2× for print.

| Guide | Start here |
| --- | --- |
| [01 — Validate CoRE Stack / IndiaSAT on the ground](./01-core-stack-lulc-validation.md) | Load tehsil maps, stand on a pixel, photograph what you see, export |
| [02 — Tree species mapping with Tessera](./02-tree-species-mapping.md) | AOI, Tessera tile ids, photo-first notes, background enrich, join later |

There is **no web dashboard**. Load a place or a GeoJSON in **Settings** before you leave. Sample polygon: [`public/data/sample-sulya-aoi.geojson`](../public/data/sample-sulya-aoi.geojson).

To regenerate screenshots (maintainers): run `npm run dev`, then `node scripts/capture-example-flows.mjs` with Playwright Chrome (`channel: 'chrome'`).
