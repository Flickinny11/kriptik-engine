import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'packages/prism-engine/src/__tests__/**/*.test.ts',
      'packages/cortex-engine/src/__tests__/**/*.test.ts',
    ],
    testTimeout: 30000,
    pool: 'forks',
    server: {
      deps: {
        inline: ['better-sqlite3'],
      },
    },
  },
});
