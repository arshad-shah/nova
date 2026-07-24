import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import type { Plugin } from 'vite'

const req = createRequire(import.meta.url)
const projectNodeModules = resolve(process.cwd(), 'node_modules')

/** True if the package is installed (CJS or ESM) — checks the directory,
 * not require.resolve, because require.resolve throws for ESM-only packages
 * even though they exist on disk.
 */
function packageIsInstalled(specifier: string): boolean {
  const parts = specifier.split('/')
  const pkgName = specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  return existsSync(join(projectNodeModules, pkgName, 'package.json'))
}

// Modules that must never be bundled — Electron runtime, native bindings,
// or post-install hooks. Rollup leaves these as runtime require().
const nativeExternals = [
  'electron',
  'electron/main',
  'electron/common',
  'better-sqlite3',
  'pg',
  'pg-native',
  'mysql2',
  'ssh2',
  'cpu-features',
  '@electron/rebuild'
]

// Deps that ship as plain JS, get bundled into out/main/index.js by Rollup.
// Bundling these inlines every transitive require so the packaged app.asar
// doesn't depend on pnpm's node_modules layout (which is unreliable across
// install variants).
const bundleThese = [
  '@arshad-shah/log-kit',
  'snowflake-sdk',
  'axios',
  'form-data',
  'mime-types',
  'mime-db',
  '@modelcontextprotocol/sdk',
  'zod',
  'csv-parse',
  'csv-stringify',
  'mongodb',
  'ioredis',
  'shiki',
  'react-markdown',
  'remark-gfm',
  'dompurify',
  // ESM-only or interop-sensitive — must be bundled or Node CJS require() fails.
  // fast-xml-parser@5.7+ pulls in xml-naming@0.1.0 which is ESM-only.
  'fast-xml-parser',
  'xml-naming',
  'strnum'
]

/**
 * Auto-externalise anything Rollup can't resolve. Bundled libs like mongodb
 * and snowflake-sdk lazy-require optional peer deps inside try/catch (kerberos,
 * mongodb-client-encryption, @aws-sdk/credential-providers, …). If Rollup
 * tries to bundle them, build emits a hard-throw stub that crashes the app
 * at startup; if we externalise them, the runtime require still throws but
 * the host's try/catch handles it gracefully — exactly the npm-install
 * behaviour.
 */
function externaliseUnresolvable(): Plugin {
  return {
    name: 'externalise-unresolvable',
    enforce: 'pre',
    resolveId(source, importer) {
      // Skip relative, absolute, and alias imports. Use isAbsolute() rather than
      // startsWith('/') so Windows drive-letter paths (C:\…) are also recognised:
      // Vite's alias plugin re-runs this resolver on the post-alias absolute path
      // (e.g. C:\…\shared/settings), and a POSIX-only check would mistake that for
      // a bare specifier, fail to require.resolve the .ts file, and externalise our
      // own internal @shared modules as runtime requires that crash at launch.
      if (source.startsWith('.') || isAbsolute(source) || source.startsWith('@/') || source.startsWith('@shared')) {
        return null
      }
      // Skip node built-ins (Rollup handles them)
      if (source.startsWith('node:')) return null
      // If the package is on disk, let Rollup bundle/resolve it (handles ESM-only too)
      if (packageIsInstalled(source)) return null
      // Try Node resolution as a final check (handles deep paths within installed packages)
      try {
        req.resolve(source, importer ? { paths: [importer] } : undefined)
        return null
      } catch {
        // Not installed and not resolvable — externalise so it becomes a runtime
        // require() that the host package's try/catch can handle.
        return { id: source, external: true }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: bundleThese }),
      externaliseUnresolvable()
    ],
    build: {
      rollupOptions: {
        external: nativeExternals,
        // Two main-process entries: the app (index.js) and the isolated-plugin
        // worker (plugin-worker.js), which is forked via utilityProcess. Both
        // land in out/main/ so worker-process.ts can resolve the worker next to
        // the main bundle.
        input: {
          index: resolve('src/main/index.ts'),
          'plugin-worker': resolve('src/main/plugins/isolation/worker-entry.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: { '@shared': resolve('shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    },
    resolve: {
      alias: { '@shared': resolve('shared') }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('shared'),
        '@brand': resolve('build')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Keep the heaviest, non-first-paint dependencies out of the entry
          // chunk and in dedicated vendor chunks. Combined with the React.lazy
          // boundaries at each render site (QueryEditor, ResultsGrid, ERDiagram,
          // ChatPanel, ChartPanel/ChartsDashboard), these chunks download on
          // first use instead of before first paint. See issue #205.
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'monaco'
            if (id.includes('ag-grid')) return 'ag-grid'
            if (id.includes('shiki')) return 'shiki'
            if (
              id.includes('react-markdown') ||
              id.includes('remark') ||
              id.includes('mdast') ||
              id.includes('micromark') ||
              id.includes('hast') ||
              id.includes('unified') ||
              id.includes('unist') ||
              id.includes('vfile') ||
              id.includes('decode-named-character-reference') ||
              id.includes('property-information')
            ) {
              return 'markdown'
            }
          }
        }
      }
    }
  }
})
