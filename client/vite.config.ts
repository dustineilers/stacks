import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// sql.js ships a WebAssembly binary that has to be fetched at runtime.
// We copy it out of node_modules into the app root so `initSqlJs({ locateFile })`
// can find it both in dev and in the production build.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: '.'
        }
      ]
    })
  ]
});
