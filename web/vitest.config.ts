import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootSrc = path.resolve(here, '..', 'src');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // The ChainRelay core is CommonJS in the repository root: let Node
        // load it natively instead of running it through the ESM pipeline.
        external: [rootSrc.replace(/\\/g, '/') + '/**'],
      },
    },
  },
});
