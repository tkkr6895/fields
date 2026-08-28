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

Screenshots for Save maps / satellite / streets / offline: [example-flows/03-offline-maps.html](../example-flows/03-offline-maps.html).

**Current product (v1.4):** offline GPS tracks and notes. Streets and Sentinel-2 for **any place on Earth** are cached on the phone (Save maps / as you pan). Sharp Esri aerial needs signal. Optional [IndiaSAT](../example-flows/01-indiasat-validation.html) and [Tessera](../example-flows/02-tessera-tree-species.html). Install from [Actions → Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml).
