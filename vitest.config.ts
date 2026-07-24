import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/mocks/**/*.test.ts'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
