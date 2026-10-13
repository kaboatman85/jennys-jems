import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path
// (e.g. https://kaboatman85.github.io/jennys-jems/).
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
