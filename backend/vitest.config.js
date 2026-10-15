import { defineConfig } from 'vitest/config';

// Suite de tests RBAC (Phase 7) : base dédiée sigbd_test, jamais la base de dev.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sigbd_test',
      JWT_SECRET: 'test-secret-key-for-testing-only-do-not-use-in-production-32chars',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
