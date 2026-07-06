import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
