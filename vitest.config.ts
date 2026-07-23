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
    // Measured against BOTH projects, merged (`pnpm test:coverage` runs the
    // whole suite with `--coverage`). The `unit` project (jsdom/node) and the
    // `storybook` project (real Chromium via Playwright) both instrument the
    // same sources with istanbul and their coverage is merged into one report,
    // so component numbers reflect reality instead of understating it. See
    // `docs/testing.md`.
    //
    // A threshold is not a goal. Percentage is trivially gamed by tests that
    // render code without asserting behaviour; prefer a smaller number of tests
    // that fail when the logic breaks.
    coverage: {
      // istanbul, not v8: coverage is merged across the `unit` (jsdom/node) and
      // `storybook` (Playwright/Chromium browser) projects in one run. v8's
      // provider races on its per-worker `.tmp/coverage-*.json` files when a
      // browser project and a node project report together (ENOENT during
      // merge); istanbul instruments the source and merges both cleanly.
      provider: 'istanbul',
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
      // Floor measured 2026-07-23 (merged unit + storybook, istanbul): 4104
      // passing tests across 485 files.
      // statements 76.46 · branches 71.62 · functions 70.82 · lines 78.19
      // Pinned a touch below to absorb browser-timing variance run-to-run;
      // raise as behavioural tests land (see docs/testing.md).
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 69,
        lines: 77,
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