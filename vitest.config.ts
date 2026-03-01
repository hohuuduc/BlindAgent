// vitest.config.ts
// Vitest configuration for the agent project.
// Uses vite-plugin-commonjs-externals to let better-sqlite3 (native addon) load normally.

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        // Increase timeout for I/O-heavy tests (SQLite, file system)
        testTimeout: 30000,
        // Inline source-maps for readable stack traces
        reporters: ['verbose'],
    },
});
