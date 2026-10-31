import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { apiMiddleware } from './server/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'favicon-64x64.png',
      ],
      manifest: {
        id: 'com.ttd.fueltracking',
        name: 'TTD Fuel Tracking',
        short_name: 'TTD Fuel',
        description: 'Industrial offline-first generator and fuel asset tracking system for Zebra handhelds',
        theme_color: '#0B0F19',
        background_color: '#0B0F19',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'en',
        dir: 'ltr',
        categories: ['business', 'productivity', 'utilities'],
        prefer_related_applications: false,
        display_override: ['standalone'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Asset details and status overview on Zebra handheld',
          },
          {
            src: '/screenshot-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Fleet tracking dashboard and transaction controls',
          },
        ],
        shortcuts: [
          {
            name: 'Scan Asset QR',
            short_name: 'Scan QR',
            description: 'Launch QR scanner to scan barcode',
            url: '/',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api/, /^\/version\.json$/, /^\/admin/, /^\/stress-test/],
        globPatterns: ['**/*.{html,ico,png,svg,woff,woff2}'],
        globIgnores: ['**/admin.html', '**/stress-test.html', '**/assets/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    {
      name: 'ttd-admin-router',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const rawUrl = req.url || '';
          const url = rawUrl.split('?')[0];
          const query = rawUrl.includes('?') ? '?' + rawUrl.split('?')[1] : '';
          if (url === '/admin' || url === '/admin/') {
            req.url = '/admin.html' + query;
          } else if (url === '/stress-test' || url === '/stress-test/') {
            req.url = '/stress-test.html' + query;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          const rawUrl = req.url || '';
          const url = rawUrl.split('?')[0];
          const query = rawUrl.includes('?') ? '?' + rawUrl.split('?')[1] : '';
          if (url === '/admin' || url === '/admin/') {
            req.url = '/admin.html' + query;
          } else if (url === '/stress-test' || url === '/stress-test/') {
            req.url = '/stress-test.html' + query;
          }
          next();
        });
      },
    },
    {
      name: 'ttd-api-server',
      configureServer(server) {
        server.middlewares.use(apiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware());
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
        stressTest: path.resolve(__dirname, 'stress-test.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
  server: {
    host: true,
  },
});
