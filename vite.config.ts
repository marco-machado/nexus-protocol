import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  build: {
    // chunk map consumed by scripts/audit-delivery.mjs for per-entry-point
    // transfer accounting
    manifest: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
