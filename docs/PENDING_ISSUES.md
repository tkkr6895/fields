# Pending — needs you (tkkr6895)

Last updated: 2026-08-22 (v1.1.0)

## Need from you to make the phone APK fully live

1. **Hosted Earth Engine proxy URL**  
   Dynamic World and IndiaSAT colouring on the installed APK cannot use `localhost`. Run `server/dynamicworld-proxy.mjs` on a machine/VPS you control (with `GEE_PROJECT` + `earthengine authenticate` or `GEE_SERVICE_ACCOUNT_JSON`), expose HTTPS, and paste the URL in the app **Settings → Earth Engine proxy URL**. Until then, point queries fall back to the bundled Western Ghats offline grid; live tiles stay off.

2. **CoRE Stack API key** (if not already in Settings)  
   [core-stack.org/use-apis](https://core-stack.org/use-apis/). Paste in Settings. Without it, tehsil WMS layers and admin names will not load.

3. **Optional Tessera proxy**  
   `python3 server/tessera-proxy.py` with `geotessera` installed if you want 128-d samples at tap time. Otherwise tile ids are still stored for later join. Hosting this on the public internet will download large tiles on first use.

## Done in v1.1.0 (no longer blocked in code)

- Export schema includes validation payload, Tessera tile, cover fractions, species, weather
- Android workflow runs `cap sync` and uploads `fields-debug`
- Capture flow is ground-first and usable without GIS terms
- Runtime proxy/API key in Settings (APK does not need a rebuild to point at your proxies)
