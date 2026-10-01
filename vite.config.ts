import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { serviceWorkerPlugin } from './pwa/vite-plugin-sw';

export default defineConfig({
  // Relative URLs, so the app works from any folder or sub-path it is hosted in.
  base: './',
  plugins: [react(), serviceWorkerPlugin('pwa/sw.js')],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
