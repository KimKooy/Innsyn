import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // ArcGIS Maps SDK and map-components ship as deep ESM trees that don't
  // play well with Vite's dependency pre-bundling — exclude them.
  optimizeDeps: {
    exclude: ['@arcgis/core', '@arcgis/map-components'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
