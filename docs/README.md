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

**Current product (v1.3):** offline GPS tracks plus notes. Two optional map loops remain — [IndiaSAT / CoRE validation](../example-flows/01-indiasat-validation.html) and [Tessera tree-species labelling](../example-flows/02-tessera-tree-species.html). Tracks and notes work with no maps at all. Install from [Actions → Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml): download the **Fields** artifact, unzip, tap `Fields.apk`.
