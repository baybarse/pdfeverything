import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pdfeverything/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ['tesseract.js'],
  },
});
