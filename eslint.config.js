import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/out/**',
    '**/.next/**',
    'deploy-artifacts/**',
    '.claude/**',
    '.omc/**',
    'server/.omc/**',
    'vendor/matrix/**',
    'node_modules/**',
    'server/node_modules/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: [
      'server/**/*.ts',
      'scripts/**/*.mjs',
      'tests/**/*.{ts,tsx}',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
])
