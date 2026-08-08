import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    // tesseract.js is reached through a dynamic import in src/lib/ocr.ts, so
    // Rollup already splits it into its own chunk and first paint never waits
    // on the OCR engine.
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
