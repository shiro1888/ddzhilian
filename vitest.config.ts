import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000/admin/providers',
      },
    },
    setupFiles: ['./tests/setup.tsx'],
    // SnapLinkStage renders a very large tree; under parallel workers on a
    // loaded machine those suites can exceed a 15s budget on render alone.
    testTimeout: 30000,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.next/**',
      '**/.claude/**',
      '**/.omc/**',
      '**/deploy-artifacts/**',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
})
