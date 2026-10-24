import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootSrc = path.resolve(here, '..', 'src');
const rootSrcPrefix = rootSrc.replace(/\\/g, '/') + '/';

/**
 * The ChainRelay CLI core (../src) is CommonJS. It is pure logic without any
 * Node built-ins, so the browser can run the very same validation, account
 * normalization, fee estimation and preflight code as the CLI — but the dev
 * server serves project files as-is, so a CommonJS file would reach the
 * browser untouched and fail with "does not provide an export named
 * 'default'".
 *
 * This plugin bundles every root core module with esbuild and serves it as an
 * ES module, in dev as well as in the production build. That keeps the two
 * environments byte-for-byte consistent instead of relying on two different
 * CommonJS pipelines.
 */
const EXTERNAL_REQUIRE = /require\(\s*["']([^"']+)["']\s*\)/g;

/** Bare package specifiers the root core requires (e.g. "@polkadot/keyring"). */
function collectExternalSpecifiers(): string[] {
  const externals = new Set<string>();

  for (const entry of fs.readdirSync(rootSrc)) {
    if (!entry.endsWith('.js')) {
      continue;
    }
    const source = fs.readFileSync(path.join(rootSrc, entry), 'utf8');
    for (const match of source.matchAll(EXTERNAL_REQUIRE)) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        externals.add(specifier);
      }
    }
  }

  return [...externals].sort();
}

/**
 * esbuild keeps `require()` calls of external packages as runtime calls when
 * the entry point is CommonJS. The banner below bridges them to real ES
 * imports, so the core and the app share one copy of each @polkadot package.
 *
 * A CommonJS dependency reaches the browser either as named exports, as the
 * module's default export, or as both. The shim merges the two so that
 * `const { decodeAddress } = require("@polkadot/keyring")` works either way.
 */
function createRequireShim(externals: string[]): string {
  const imports = externals.map(
    (specifier, index) =>
      `import * as __chainrelay_ext_${index} from ${JSON.stringify(specifier)};`,
  );
  const entries = externals
    .map(
      (specifier, index) =>
        `${JSON.stringify(specifier)}: __chainrelay_ext_${index}`,
    )
    .join(', ');

  return [
    ...imports,
    `const __chainrelay_externals = { ${entries} };`,
    'function require(id) {',
    '  const mod = __chainrelay_externals[id];',
    '  if (!mod) {',
    '    throw new Error("Unsupported require(\\"" + id + "\\") in the ChainRelay core bundle");',
    '  }',
    '  const resolved = Object.assign({}, mod);',
    '  if (mod.default && typeof mod.default === "object") {',
    '    Object.assign(resolved, mod.default);',
    '  }',
    '  return resolved;',
    '}',
  ].join('\n');
}

function chainrelayCorePlugin(): Plugin {
  const externals = collectExternalSpecifiers();
  const banner = createRequireShim(externals);
  const cache = new Map<string, string>();

  return {
    name: 'chainrelay-core-cjs',
    enforce: 'pre',
    async load(id) {
      const file = id.split('?')[0].replace(/\\/g, '/');

      if (!file.startsWith(rootSrcPrefix) || !file.endsWith('.js')) {
        return null;
      }

      const cached = cache.get(file);
      if (cached !== undefined) {
        return { code: cached, map: null };
      }

      const result = await build({
        entryPoints: [file],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        external: externals,
        banner: { js: banner },
        write: false,
        logLevel: 'silent',
      });

      const code = result.outputFiles[0].text;
      cache.set(file, code);

      return { code, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), chainrelayCorePlugin()],
  resolve: {
    // The app and the ChainRelay core must use the same @polkadot packages.
    dedupe: [
      '@polkadot/api',
      '@polkadot/keyring',
      '@polkadot/util',
      '@polkadot/util-crypto',
    ],
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          polkadot: ['@polkadot/api', '@polkadot/keyring', '@polkadot/util'],
        },
      },
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow the dev server to read the ChainRelay core in the repo root.
      allow: [path.resolve(here, '..')],
    },
  },
});
