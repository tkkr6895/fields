# Field Validator - Developer Setup Guide

> Complete guide for setting up the development environment and building the application

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Development Modes](#development-modes)
5. [Building for Production](#building-for-production)
6. [Android APK Build](#android-apk-build)
7. [Generating Offline Data](#generating-offline-data)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or higher | JavaScript runtime |
| npm | 9.x or higher | Package manager (comes with Node.js) |
| Git | Any recent | Version control |

### Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| Android Studio | 2023.x+ | Building Android APK |
| Python | 3.9+ | Generating offline Dynamic World data |
| Java JDK | 17+ | Android builds (via Android Studio) |

### API Keys (Optional)

| Service | Required For | How to Obtain |
|---------|--------------|---------------|
| CoRE Stack | Online watershed data | [core-stack.org/use-apis](https://core-stack.org/use-apis/) |
| Google Earth Engine | Live Dynamic World | [developers.google.com/earth-engine](https://developers.google.com/earth-engine/guides/getstarted) |

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields/field-validator-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at **http://localhost:5173**

### 4. Open in Browser

Navigate to the URL. The app works fully offline once loaded, but some features require API configuration.

---

## Environment Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# .env

# CoRE Stack API key (optional - enables online watershed data)
VITE_CORESTACK_API_KEY=your_corestack_api_key_here

# Dynamic World GEE Proxy URL (optional - for production deployments)
# In development, the Vite proxy handles this automatically
VITE_DW_GEE_PROXY_URL=

# GEE Project ID (for running the DW proxy server)
GEE_PROJECT=your-gee-project-id

# DW Proxy Server Port
PORT=8787
```

### Vite Proxy Configuration

The development server automatically proxies API requests to avoid CORS issues:

```typescript
// vite.config.ts - Already configured
server: {
  proxy: {
    '/api/corestack': {
      target: 'https://api-doc.core-stack.org',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/corestack/, '/api/v1')
    },
    '/api/dw': {
      target: 'http://localhost:8787',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/dw/, '')
    }
  }
}
```

---

## Development Modes

### Mode 1: Basic Development (No APIs)

Run the app with local data only:

```bash
npm run dev
```

**Available features:**
- Map navigation
- Local dataset layers
- Offline observation capture
- Photo capture with GPS
- Place search (offline gazetteer)
- Export observations

**Not available:**
- Live Dynamic World land cover
- CoRE Stack watershed data
- Live weather data

### Mode 2: With CoRE Stack API

1. Get an API key from [core-stack.org](https://core-stack.org/use-apis/)
2. Either:
   - Add `VITE_CORESTACK_API_KEY=xxx` to `.env`, OR
   - Configure via app Settings panel after loading

```bash
npm run dev
```

**Additional features:**
- Admin boundary lookup (state/district/tehsil)
- Micro-watershed indicators
- Dynamic GeoServer layers
- Waterbody data

### Mode 3: Full Features (With GEE Proxy)

For live Dynamic World land cover data:

1. Install Earth Engine CLI:
```bash
pip install earthengine-api
earthengine authenticate
```

2. Set GEE project in `.env`:
```
GEE_PROJECT=your-gee-project-id
```

3. Start both servers:
```bash
npm run dev:full
```

**Additional features:**
- Real-time 10m land cover classification
- Dynamic World map layer
- Point-specific class probabilities

---

## Building for Production

### Web Build

```bash
npm run build
```

Output directory: `dist/`

### Preview Production Build

```bash
npm run preview
```

### Deployment Notes

- The `dist/` folder contains a static site that can be deployed to any web server
- For Dynamic World features in production, deploy the `server/dynamicworld-proxy.mjs` server separately and set `VITE_DW_GEE_PROXY_URL`
- CoRE Stack API calls work directly (no CORS proxy needed in production)

---

## Android APK Build

### Prerequisites

1. **Install Android Studio** from [developer.android.com](https://developer.android.com/studio)
2. **Install Android SDK** (API 33 or higher recommended)
3. **Configure local.properties** (created automatically on first sync)

### Build Steps

1. Build the web app and sync to Android:
```bash
npm run android:build
```

2. Open in Android Studio:
```bash
npm run android:open
```

3. In Android Studio:
   - Wait for Gradle sync to complete
   - Select **Build > Build Bundle(s) / APK(s) > Build APK(s)**
   - APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Alternative: Command Line Build

```bash
cd android
./gradlew assembleDebug
```

### Release Build

For signed release builds:

1. Create a keystore:
```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-alias
```

2. Update `capacitor.config.ts`:
```typescript
android: {
  buildOptions: {
    keystorePath: '/path/to/my-release-key.jks',
    keystorePassword: 'your-password',
    keystoreAlias: 'my-alias',
    keystoreAliasPassword: 'your-alias-password',
    releaseType: 'APK'
  }
}
```

3. Build release APK in Android Studio:
   - **Build > Generate Signed Bundle / APK**

---

## Generating Offline Data

### Dynamic World Grid Data

Generate pre-computed land cover data for offline use:

```bash
# Install Python dependencies
pip install earthengine-api

# Authenticate with GEE
earthengine authenticate

# Generate grid data for Western Ghats
python scripts/generate-dw-grid.py \
  --bounds 8.0,72.5,21.5,78.5 \
  --resolution 100 \
  --output public/data/dynamicworld/
```

**Arguments:**
- `--bounds`: south,west,north,east in degrees
- `--resolution`: Grid spacing in meters (100m ≈ 3MB, 500m ≈ 100KB)
- `--output`: Output directory
- `--project`: GEE project ID (optional, uses default if authenticated)

### Prepare Dataset Layers

```bash
node scripts/prepare-datasets.js
```

This script processes raw data files into the format expected by the app.

---

## Troubleshooting

### Common Issues

#### "Database unavailable" Error

The IndexedDB failed to open. Solutions:
1. Clear browser data and reload
2. Try incognito/private mode
3. Check browser storage settings

#### CoRE Stack API Errors

**401 Unauthorized**: API key is invalid or missing
- Check the key in `.env` or Settings panel
- Verify the key at [core-stack.org](https://core-stack.org)

**CORS Errors**: Proxy not working
- Ensure using `npm run dev` (not direct file access)
- Check Vite server is running

#### Dynamic World Not Loading

**"No Dynamic World data available"**:
1. Check if proxy is running: `npm run dev:dw-proxy`
2. Verify GEE authentication: `earthengine authenticate`
3. Check GEE_PROJECT in `.env`

**"Location outside coverage area"**:
- The offline grid data doesn't cover your location
- Generate new grid data with expanded bounds

#### GPS Not Working

**Browser**:
- Allow location permission when prompted
- HTTPS required for geolocation (localhost is exempt)

**Android**:
- Grant location permissions in app settings
- Enable location services on device

#### Images Not Saving

- Check IndexedDB storage quota in browser dev tools
- Clear old observations to free space
- On Android, ensure app has storage permissions

### Debug Mode

Enable verbose logging:

```javascript
// In browser console
localStorage.setItem('debug', '*');
location.reload();
```

### Checking Service Status

In the browser console:

```javascript
// Check CoreStack
import { coreStackService } from './src/services/CoreStackService';
console.log('API Key:', coreStackService.hasApiKey());
console.log('Available:', coreStackService.isAvailable());

// Check DynamicWorld
import { dynamicWorldService } from './src/services/DynamicWorldService';
console.log('Status:', dynamicWorldService.getDataSourceStatus());
console.log('Offline data:', dynamicWorldService.hasOfflineData());
console.log('Live access:', dynamicWorldService.hasLiveAccess());
```

---

## NPM Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start Vite dev server |
| `dev:dw-proxy` | `node server/dynamicworld-proxy.mjs` | Start GEE proxy server |
| `dev:full` | `concurrently...` | Start both servers |
| `build` | `tsc && vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
| `prepare-data` | `node scripts/prepare-datasets.js` | Process datasets |
| `android:init` | `npx cap add android` | Initialize Android project |
| `android:sync` | `npx cap sync android` | Sync web assets to Android |
| `android:open` | `npx cap open android` | Open in Android Studio |
| `android:build` | `npm run build && npx cap sync android` | Full Android build prep |
| `android:run` | `npx cap run android` | Run on connected device |

---

## VS Code Setup

### Recommended Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

### Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

---

*Last updated: 2025*
