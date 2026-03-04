import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.westernghats.fieldvalidator',
  appName: 'WG Field Validator',
  webDir: 'dist',
  server: {
    // Use embedded assets, no external server needed
    androidScheme: 'https'
  },
  android: {
    // Build as standalone app
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  },
  plugins: {
    // Geolocation permissions
    Geolocation: {
      permissions: ['location', 'coarseLocation']
    },
    // Camera permissions (Task 1.6.3)
    Camera: {
      permissions: ['camera', 'photos']
    },
    // Network (Task 1.6.3) — no special config needed, just declared
    Network: {}
  }
};

export default config;
