import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
}));
