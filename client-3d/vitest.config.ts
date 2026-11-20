import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Node tests: the 3D client's DOM-free helpers, and a live room shared by a 2D-style and a 3D-style client.
export default defineConfig({
  resolve: {
    alias: { '@client': fileURLToPath(new URL('../client/src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
