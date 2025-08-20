import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.spec.ts',
        '**/*.test.ts',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
    },
    setupFiles: ['./test/setup.ts'],
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