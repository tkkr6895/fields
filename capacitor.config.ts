import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.westernghats.fieldvalidator',
  appName: 'Fields',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    useLegacyBridge: true,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  },
  plugins: {
    Geolocation: {
      permissions: ['location', 'coarseLocation']
    },
    Camera: {
      permissions: ['camera', 'photos']
    },
    Network: {},
    CapacitorHttp: {
      enabled: true,
    },
  }
};

export default config;
