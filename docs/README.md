# Field Validator - Documentation Index

> Complete documentation for the Western Ghats Field Validator application

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, data flows, and technology stack |
| [Developer Guide](./DEVELOPER_GUIDE.md) | Setup, configuration, and development workflows |
| [Components](./COMPONENTS.md) | React component API reference |
| [Services](./SERVICES.md) | Business logic and service modules |
| [Database](./DATABASE.md) | IndexedDB schema and data management |
| [API Integrations](./API_INTEGRATIONS.md) | External API documentation |
| [Types](./TYPES.md) | TypeScript interface reference |

---

## Getting Started

### For New Developers

1. **[Developer Guide](./DEVELOPER_GUIDE.md)** - Start here for environment setup
2. **[Architecture](./ARCHITECTURE.md)** - Understand the system design
3. **[Types](./TYPES.md)** - Review the data models

### For Feature Development

1. **[Components](./COMPONENTS.md)** - UI component patterns and props
2. **[Services](./SERVICES.md)** - Business logic layer
3. **[API Integrations](./API_INTEGRATIONS.md)** - External service endpoints

### For Data Integration

1. **[Database](./DATABASE.md)** - Local storage patterns
2. **[API Integrations](./API_INTEGRATIONS.md)** - CoRE Stack, Dynamic World, Weather APIs
3. **[Types](./TYPES.md)** - Data structures

---

## Application Overview

### What It Does

Field Validator enables field workers to:
- Navigate maps with offline support
- Capture geotagged photos with GPS coordinates
- Query satellite land cover data (Dynamic World)
- Access government watershed data (CoRE Stack)
- Record ground-truth observations
- Export data as GeoJSON/CSV

### Key Features

| Feature | Status | Documentation |
|---------|--------|---------------|
| Offline-first PWA | ✅ Complete | [Architecture](./ARCHITECTURE.md#offline-capabilities) |
| Map navigation | ✅ Complete | [Components - MapView](./COMPONENTS.md#mapview) |
| Photo capture | ✅ Complete | [Services - ImageService](./SERVICES.md#imageservice) |
| Dynamic World | ✅ Complete | [Services - DynamicWorldService](./SERVICES.md#dynamicworldservice) |
| CoRE Stack | ✅ Complete | [Services - CoreStackService](./SERVICES.md#corestackservice) |
| Weather data | ✅ Complete | [Services - WeatherService](./SERVICES.md#weatherservice) |
| Place search | ✅ Complete | [Services - GazetteerService](./SERVICES.md#gazetteerservice) |
| Data export | ✅ Complete | [Database](./DATABASE.md#export-functions) |
| Android APK | ✅ Complete | [Developer Guide](./DEVELOPER_GUIDE.md#android-apk-build) |

### Technology Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, TypeScript, MapLibre GL |
| Build | Vite, Service Worker (Workbox) |
| Mobile | Capacitor 8 |
| Storage | IndexedDB (Dexie) |
| APIs | CoRE Stack, Google Earth Engine, Open-Meteo |

---

## File Structure

```
field-validator-app/
├── src/
│   ├── components/    # React UI components
│   ├── services/      # Business logic
│   ├── db/            # Database layer
│   ├── hooks/         # Custom React hooks
│   ├── config/        # Configuration
│   ├── styles/        # CSS
│   └── types/         # TypeScript interfaces
├── public/
│   └── data/          # Static datasets
├── server/            # GEE proxy server
├── scripts/           # Data processing scripts
├── android/           # Native Android project
└── docs/              # This documentation
```

---

## Common Tasks

### Add a New Data Layer

1. Add layer configuration to `public/data/dataset-manifest.json`
2. Create types if needed in `src/types/index.ts`
3. Update `DatasetManager` if custom parsing required
4. Add rendering logic in `MapView.tsx`

See: [Architecture - Extension Points](./ARCHITECTURE.md#extension-points)

### Add a New API Integration

1. Create service in `src/services/`
2. Define types for request/response
3. Add proxy configuration in `vite.config.ts` if needed
4. Integrate in relevant components

See: [Services](./SERVICES.md), [API Integrations](./API_INTEGRATIONS.md)

### Modify the Database Schema

1. Update interfaces in `src/db/database.ts`
2. Increment schema version and add migration
3. Update related types in `src/types/index.ts`

See: [Database - Migration Notes](./DATABASE.md#migration-notes)

### Build for Android

```bash
npm run android:build
npm run android:open
# Build > Build APK(s) in Android Studio
```

See: [Developer Guide - Android APK Build](./DEVELOPER_GUIDE.md#android-apk-build)

---

## Contributing

### Code Style

- TypeScript strict mode enabled
- Functional React components with hooks
- Service layer pattern for business logic
- Dexie for database operations

### Documentation Standards

- Update relevant docs when changing code
- Include TypeScript types in examples
- Add JSDoc comments for public APIs

---

## Support

### Issues

Report bugs or feature requests via GitHub Issues.

### Contact

For questions or contributions, please open a [GitHub Issue](https://github.com/tkkr6895/fields/issues).

---

*Documentation last updated: May 2026*
