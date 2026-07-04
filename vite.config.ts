import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
});
