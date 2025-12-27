# WG Field Validator

**Offline-first Field Validation App for Western Ghats LULC**

A mobile-first, dark-themed app for field validation of Land Use / Land Cover datasets in the Western Ghats region. Works completely offline with preloaded datasets.

## 📱 Download APK (Easiest Method)

### From GitHub Releases

1. Go to the [Releases page](../../releases)
2. Download the latest `app-debug.apk`
3. On your Android phone:
   - Enable "Install from unknown sources" in Settings
   - Open the downloaded APK file
   - Tap "Install"
4. Open the app and start validating!

> **Security Note:** The APK contains no API keys or credentials. Your CoreStack API key (if needed) is entered in the app settings and stored only on your device. See [SECURITY.md](SECURITY.md) for details.

---

## 🔧 Build from Source

### Prerequisites
- Node.js 18+ installed
- npm or pnpm

### Installation

```powershell
# Navigate to the app directory
cd field-validator-app

# Install dependencies
npm install

# Prepare datasets from workspace
npm run prepare-data

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build APK Locally

Requires Java 17+ and Android SDK:

```powershell
# Build web app
npm run build

# Sync to Android
npm run android:sync

# Build APK (in android folder)
cd android
./gradlew assembleDebug
```

APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`

### Production Build (Web)

```powershell
# Build for production
npm run build

# Preview production build locally
npm run preview
```

The production build will be in the `dist/` folder.

## 📱 Features

### Method 1: Via Browser (Recommended)
1. Open the app URL in Chrome on Android
2. Tap the menu (⋮) → "Add to Home screen"
3. The app will install as a standalone PWA

### Method 2: Via Local Server
1. Build the app: `npm run build`
2. Serve the `dist/` folder using any static server:
   ```powershell
   npx serve dist
   ```
3. Access from your phone and install

## 📊 Available Datasets

The app is preconfigured to use datasets from your Western Ghats workspace:

### Boundaries
- **Western Ghats Boundary** - Full WG region outline
- **Dakshina Kannada District** - Focus area boundary

### LULC Layers (GLC-FCS30D)
- **LULC Composition** - Land cover classes (1987-2010)
- **Tree Cover** - Forest/tree statistics by year
- **Built Area (GLC)** - Urbanization from GLC dataset
- **Built Area (Dynamic World)** - High-res built area (2018-2025)

### Forest Data
- **Forest Typology** - Forest classification
- **Regional Forest Comparison** - Cross-region analysis

### CoreStack Data
- **CoreStack Blocks** - Available block-level data
- **District Coverage** - Which WG districts have CoreStack data
- **Cropping Intensity** - Agricultural metrics
- **Water Balance** - Watershed hydrology

## 🔧 Adding New Datasets

### Step 1: Add source file to workspace

Place your GeoJSON, CSV, or other data file in the appropriate `outputs/` folder.

### Step 2: Update the prepare script

Edit `scripts/prepare-datasets.js` to add your file:

```javascript
const DATASET_SOURCES = {
  // Add to appropriate category
  lulc: [
    // ... existing files
    {
      src: 'outputs/your_new_dataset.csv',
      dest: 'lulc/your_new_dataset.csv'
    }
  ]
};
```

### Step 3: Update the manifest

Edit `public/data/dataset-manifest.json` to add layer definition:

```json
{
  "id": "your_new_layer",
  "title": "Your New Layer",
  "type": "csv",
  "source": { "format": "csv", "path": "/data/lulc/your_new_dataset.csv" },
  "style": { "kind": "categorical", "field": "main_field" },
  "query": { "mode": "summary", "fields": ["field1", "field2"] },
  "category": "lulc",
  "enabled": true
}
```

### Step 4: Rebuild

```powershell
npm run prepare-data
npm run build
```

## 🗂️ Project Structure

```
field-validator-app/
├── public/
│   ├── data/                    # Static datasets
│   │   ├── boundaries/          # GeoJSON boundaries
│   │   ├── lulc/               # LULC CSV data
│   │   ├── forest/             # Forest analysis
│   │   ├── corestack/          # CoreStack exports
│   │   └── dataset-manifest.json
│   ├── pwa-192x192.png         # PWA icons
│   └── pwa-512x512.png
├── scripts/
│   └── prepare-datasets.js      # Data preparation script
├── src/
│   ├── components/
│   │   ├── MapView.tsx         # MapLibre map
│   │   ├── CaptureModal.tsx    # Photo capture
│   │   ├── FieldLog.tsx        # Observation list
│   │   ├── LayerPanel.tsx      # Layer toggles
│   │   ├── LocationSummary.tsx # Location info
│   │   └── ...
│   ├── db/
│   │   └── database.ts         # Dexie IndexedDB
│   ├── services/
│   │   ├── DatasetManager.ts   # Data loading
│   │   ├── GeoLocationService.ts
│   │   └── ImageService.ts     # EXIF extraction
│   ├── styles/
│   │   └── global.css          # Dark theme
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎯 Features

### Map-First UI
- Dark-themed MapLibre GL map
- Basemap toggle (Map/Satellite)
- Auto-hiding controls
- GPS location with accuracy ring

### Offline Operation
- Service Worker caches app shell
- IndexedDB stores observations
- Local dataset storage
- Works without internet

### Field Capture
- 📷 Camera capture with EXIF extraction
- 📍 GPS coordinates from device or photo
- 📊 Instant dataset lookup at location
- ✅ One-tap validation (Match/Mismatch/Unclear)

### Field Log
- Chronological observation list
- Filter by validation status
- Photo thumbnails
- Export to GeoJSON or CSV

## 🔒 Offline Reliability

The app uses a multi-layer offline strategy:

1. **Service Worker** - Caches app shell and static assets
2. **IndexedDB** - Stores observations, photos, and cached data
3. **Cache API** - Stores tile and dataset responses
4. **Local State** - React state for UI responsiveness

## 📤 Exporting Data

From the Field Log:
1. Tap the 📋 button to open the log
2. Scroll to the bottom
3. Choose export format:
   - **GeoJSON** - For GIS software (QGIS, ArcGIS)
   - **CSV** - For spreadsheets

## 🐛 Troubleshooting

### "Location unavailable"
- Ensure GPS is enabled on your device
- Grant location permission when prompted
- Try outdoors for better GPS signal

### Map tiles not loading
- Check internet connection (for initial load)
- Tiles will be cached after first view

### Dataset not showing
- Run `npm run prepare-data` to copy files
- Check browser console for errors
- Verify file exists in `public/data/`

### PWA not installing
- Use Chrome or Edge (Safari has limited PWA support)
- Ensure HTTPS in production (localhost works for dev)

## 📄 License

This application is part of the Western Ghats research workspace.

---

**Built for field work. Map stays central. Everything else is secondary.**
