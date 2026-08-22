# Fields docs

Start with the root [README](../README.md), then walk through a worked example in [example-flows/](../example-flows/).

This folder is reference material for people changing the code.

| Doc | Use |
| --- | --- |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Clone, `.env`, `npm run dev`, Android |
| [API_INTEGRATIONS.md](./API_INTEGRATIONS.md) | CoRE Stack (`X-API-Key`), IndiaSAT WMS, Tessera, weather, GBIF |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How capture, map, and background enrich fit together |
| [PENDING_ISSUES.md](./PENDING_ISSUES.md) | Field-trial caveats (coverage, CORS on APK) |
| [SERVICES.md](./SERVICES.md) | Service modules (current index; some older names remain in git history) |
| [COMPONENTS.md](./COMPONENTS.md) | UI components |
| [DATABASE.md](./DATABASE.md) | IndexedDB / Dexie |
| [TYPES.md](./TYPES.md) | TypeScript types |
| [STAC_ALIGNMENT.md](./STAC_ALIGNMENT.md) | Export metadata |
| [plan/](./plan/) | Original spec (historical) |
| [archive/](./archive/) | Demo scripts and session notes (often outdated) |

**Current product (v1.2):** photo-first notes for **tree species mapping** and **IndiaSAT / CoRE Stack** validation. There is **no Google Earth Engine** and **no Dynamic World** in the running app. Tessera embeddings are not painted as a global raster; every observation stores `tessera.tileId` (`grid_{lon}_{lat}` on a 0.1° grid) so you can join [GeoTessera](https://github.com/ucam-eo/geotessera) tiles on a workstation.
