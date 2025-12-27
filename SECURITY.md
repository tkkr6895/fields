# Security & Privacy

This document explains how the WG Field Validator app handles sensitive data and credentials.

## 🔐 Credential Handling

### API Keys Are Never Stored in Code

The app is designed to be **safe to share publicly**. No API keys, credentials, or secrets are hardcoded in the source code or bundled with the APK.

### How API Keys Work

1. **CoreStack API Key**
   - Entered by you in the app settings (🔑 button)
   - Stored **only on your device** in the browser's localStorage
   - Never transmitted except to the CoreStack API itself
   - Never logged or shared with third parties

2. **Google Earth Engine (GEE)**
   - If you need GEE integration, you authenticate through Google's OAuth flow
   - Tokens are stored locally on your device
   - The app never sees your Google password

### What the APK Contains

The APK/app bundle includes:
- ✅ App code (HTML, CSS, JavaScript)
- ✅ Offline maps and datasets (public data only)
- ✅ Place name gazetteer
- ❌ **NO** API keys
- ❌ **NO** user credentials
- ❌ **NO** private data

## 🔒 Data Storage

| Data Type | Storage Location | Shared? |
|-----------|------------------|---------|
| API Keys | Device localStorage | ❌ No |
| Observations | Device IndexedDB | ❌ No |
| Photos | Device IndexedDB | ❌ No |
| Map tiles | Device cache | ❌ No |

## 🌐 Network Requests

When online, the app may connect to:

1. **OpenStreetMap Nominatim** (place search)
   - No authentication required
   - Only sends search queries

2. **CoreStack API** (optional enrichment)
   - Only if you configure an API key
   - Uses HTTPS encryption
   - API key sent in request headers

3. **Map tile servers** (basemaps)
   - Carto Dark tiles
   - ESRI Satellite tiles
   - No authentication, public tiles

## 🛡️ Best Practices

1. **Keep your API key private** - Don't share it in screenshots or logs
2. **Use the app's settings** - Enter API keys through the secure UI
3. **Export carefully** - When exporting observations, review for sensitive notes

## 📱 Offline Mode

The app works fully offline:
- All local datasets are pre-bundled
- Place search works offline for Karnataka
- Observations saved locally until you choose to export
- No network requests required for core functionality

## 🔄 Source Code Audit

The app is open source. You can verify:
- No hardcoded secrets in `/src`
- API keys loaded from localStorage only
- No telemetry or tracking code
- All network requests are explicit in the service files

---

**Questions?** Open an issue on GitHub.
