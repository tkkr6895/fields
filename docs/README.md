# Fields docs

Start with the root [README](../README.md). This folder holds reference material; some of it describes older UI names.

| Doc | Use |
| --- | --- |
| [PENDING_ISSUES.md](./PENDING_ISSUES.md) | What still needs credentials or a hosted proxy |
| [API_INTEGRATIONS.md](./API_INTEGRATIONS.md) | CoRE Stack, GEE, weather |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack overview (partially historical) |
| [plan/SPEC.md](./plan/SPEC.md) | Original product spec |
| [schemas/training_pipeline_schema.json](./schemas/training_pipeline_schema.json) | Export shape for model training |
| [archive/](./archive/) | Session notes, demo scripts, stale handoffs |

Tessera embeddings are not streamed as a global raster in the app. Every observation stores `tessera.tileId` (`grid_{lon}_{lat}` on the 0.1° grid, year 2024 by default) so you can join labels to [GeoTessera](https://github.com/ucam-eo/geotessera) tiles on a workstation.
