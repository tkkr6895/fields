# Known limitations

Last updated: 2026-08-29 (v1.4.1)

These are product and platform constraints, not a personal checklist.

- **Background GPS** continues with other apps open via an Android foreground service. Some OEM battery savers still stop it if Fields is force-stopped or set to “restricted”. Swiping the app away from Recents is usually fine while the track notification is showing.

- **Esri World Imagery** is online-only. Tiles are not stored (licence). Offline satellite is Sentinel-2 (~10 m) for views already cached or saved.
- **IndiaSAT / CoRE** WMS needs a network and an API key. On the APK, tiles talk to GeoServer directly (no Vite proxy). CORS or the GeoServer TLS certificate can block colouring; tracks and notes still save.
- **Tessera** colour for tiles outside the bundled Sulya previews needs an optional proxy. Tile ids are always computed on device.
- **Nominatim, weather, GBIF** need a network.
- **Android install** fails if a previous Fields APK used a different signing key. Uninstall that build, then install the new APK.
- **Cache quota:** Save maps refuses very large bboxes (~9000 tiles). Clearing site data / app storage drops cached maps.

Earth Engine is not used.
