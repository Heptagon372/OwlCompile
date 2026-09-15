import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: root }] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { OWL_DB_PATH: ':memory:' },
    pool: 'forks',
  },
});
