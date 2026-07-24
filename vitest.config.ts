import { defineConfig } from 'vitest/config';
import path from 'path';

// Vitest 設定
// - environment: node（純粋な TS ロジックだから DOM 不要）
// - pool: 'forks'（Windows で worker_threads が Vite prebundle 中にハングする既知問題の回避）
// - resolve.alias: @/ → src/ を Vitest 側でも認識させる（tsconfig と揃える）
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/mocks/**/*.test.ts', 'src/state/**/*.test.ts', 'src/storage/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    coverage: { reporter: ['text', 'html'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
