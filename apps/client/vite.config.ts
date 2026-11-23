import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve workspace packages (@roe/*) straight to their TypeScript sources.
    conditions: ['@roe/source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
  },
  build: {
    // three.js alone is ~700 kB minified; vendor chunks are split out for caching.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            {
              name: 'r3f',
              test: /node_modules[\\/](@react-three|three-stdlib|three-mesh-bvh)[\\/]/,
            },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
