/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Relative base so the build works at any GitHub Pages project path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});
