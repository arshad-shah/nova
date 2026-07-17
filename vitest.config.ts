import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    // Coverage is a RATCHET, not a target. `thresholds` are pinned to the
    // measured floor at the time of writing; CI fails if a change drops below
    // them. When you raise coverage, raise the floor in the same PR so it can
    // never silently slide back.
    //
    // Measured against the `unit` project only (`pnpm test:coverage`), which is
    // what CI gates on. The `storybook` project renders components in a real
    // browser and is not counted here — so component numbers understate reality.
    //
    // A threshold is not a goal. Percentage is trivially gamed by tests that
    // render code without asserting behaviour; prefer a smaller number of tests
    // that fail when the logic breaks.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
      exclude: [
        '**/*.stories.{ts,tsx}',
        '**/*.d.ts',
        // Process entry points / bootstrap: no logic worth asserting, and they
        // pull Electron's runtime into the jsdom project when instrumented.
        'src/renderer/src/main.tsx',
        'src/preload/**',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // Floor measured 2026-07-17: 1687 passing tests across 183 files.
      // statements 34.31 · branches 30.00 · functions 29.35 · lines 36.14
      thresholds: {
        statements: 34.3,
        branches: 30,
        functions: 29.3,
        lines: 36.1,
        autoUpdate: false,
      },
    },
    projects: [{
      extends: true,
      test: {
        name: 'unit',
        globals: true,
        environment: 'jsdom',
        include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
        setupFiles: ['tests/setup.ts'],
        alias: {
          '@shared': resolve(__dirname, 'shared'),
          '@': resolve(__dirname, 'src/renderer/src')
        }
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});