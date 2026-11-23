import { defineConfig } from 'vitest/config';

// Resolve workspace packages (@roe/*) to their TypeScript sources, like the client and server dev setups.
const conditions = ['@roe/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { include: ['src/**/*.test.ts'] },
});
