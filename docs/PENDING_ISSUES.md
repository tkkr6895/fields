# Pending — needs you (tkkr6895)

Last updated: 2026-08-22 (v1.2.0)

## For a field trial

1. **CoRE Stack API key** in `.env` as `VITE_CORESTACK_API_KEY` (dev) or Settings on the phone. Without it, IndiaSAT colouring and tehsil names will not load. Notes and photos still save.
2. **Coverage is uneven.** Sulya-class tehsils have many layers; some tehsils only have an admin boundary. The app should say so and still let you collect trees.
3. **Optional Tessera proxy** if you want embedding samples. Tile ids are stored without it.
4. **APK CORS:** the installed app talks to `geoserver.core-stack.org:8443` directly. If tiles fail on device but work in `npm run dev`, it is CORS / certificate. Use the PWA from a machine that proxies `/api/geoserver` until that is hosted.

Earth Engine is no longer required.
