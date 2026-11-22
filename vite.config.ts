import { defineConfig } from 'vite';

export default defineConfig({
  // relative URLs: the built game (dist/) works from any folder or sub-path
  base: './',
  build: {
    target: 'es2022',            // top-level await in src/assets.ts
    chunkSizeWarningLimit: 800,  // three.js alone is ~600 kB
  },
});
