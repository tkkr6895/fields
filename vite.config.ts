import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'WG Field Validator',
        short_name: 'WGValidator',
        description: 'Offline-first field validation for Western Ghats datasets',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,geojson,csv}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB for datasets
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wg-datasets',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/tiles\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wg-tiles',
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'esnext',
    sourcemap: true
  },
  server: {
    host: true,
    port: 5173
  }
});
