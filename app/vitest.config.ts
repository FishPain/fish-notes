import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
    // Native addons (onnxruntime via transformers.js, better-sqlite3/sqlite-vec)
    // can segfault when loaded across parallel workers. One forked process is stable.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
})
