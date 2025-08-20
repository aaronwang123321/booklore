import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.e2e.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/e2e-setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@': '/src',
      '@/auth': '/src/auth',
      '@/book': '/src/book',
      '@/library': '/src/library',
      '@/subscription': '/src/subscription',
      '@/upload': '/src/upload',
      '@/websocket': '/src/websocket',
      '@/shared': '/src/shared',
    },
  },
});