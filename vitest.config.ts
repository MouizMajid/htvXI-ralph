import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Read @ralph/shared from its .ts source (see packages/shared/package.json "source" export).
  resolve: { conditions: ['source'] },
  test: { exclude: ['**/node_modules/**', '**/dist/**'] },
});
