# Pending — needs you (tkkr6895)

Last updated: 2026-08-29 (v1.3.1)

## For a field trial

1. **Install from Actions.** Download the **Fields** artifact zip, extract, tap `Fields.apk`. Uninstall any older Fields first if the signature changed.
2. **CoRE Stack API key** in `.env` as `VITE_CORESTACK_API_KEY` (dev) or Settings on the phone. Without it, IndiaSAT colouring and tehsil names will not load. Notes, photos, and GPS tracks still save.
3. **Coverage is uneven.** Sulya-class tehsils have many layers; some tehsils only have an admin boundary. The app should say so and still let you collect trees.
4. **Offline is GPS + notes, not satellite.** Esri/CARTO basemap tiles and IndiaSAT need signal. The track and pins still draw on a blank canvas. Import AOIs and pan to the site while you still have coverage if you want a familiar view.
5. **Optional Tessera proxy** if you want embedding samples. Packed Sulya previews and tile ids still work without it.
6. **APK CORS:** the installed app talks to `geoserver.core-stack.org:8443` directly. If tiles fail on device but work in `npm run dev`, it is CORS / certificate. Use the PWA from a machine that proxies `/api/geoserver` until that is hosted.

Earth Engine is no longer required.
