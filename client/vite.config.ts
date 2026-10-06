import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';

// sql.js ships a WebAssembly binary that has to be fetched at runtime.
// We copy it out of node_modules into the app root so `initSqlJs({ locateFile })`
// can find it both in dev and in the production build.

// Service workers (needed for offline/PWA support) only run in a "secure
// context" — https, or http on localhost exactly. A plain http://<LAN IP>
// doesn't qualify, so LAN access needs real TLS. `mkcert` (see ../certs/)
// generates a certificate trusted by this machine's local CA, covering both
// localhost and the LAN IP.
const httpsConfig = {
  key: readFileSync('../certs/key.pem'),
  cert: readFileSync('../certs/cert.pem')
};

export default defineConfig({
  // Reachable from other devices on the same WiFi (e.g. a phone), not just
  // this machine — needed so the app can be opened from another device at
  // all, separately from the backend's own LAN sync.
  server: {
    host: true,
    https: httpsConfig
  },
  preview: {
    host: true,
    https: httpsConfig
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: '.'
        }
      ]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Stacks',
        short_name: 'Stacks',
        description: 'Your cookbook shelf',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ECE3CE',
        theme_color: '#241F1A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // sql.js's WASM binary has to be precached too, or the local database
        // can't boot at all when the app is opened offline.
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,woff2}']
      }
    })
  ]
});
