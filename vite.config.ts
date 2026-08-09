/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5801, strictPort: true },
  // Pin PostCSS to this project so Vite never walks up and picks up an
  // unrelated config from a parent directory.
  css: { postcss: {} },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    // Two games, two entry points. The Binding shares nothing with Little
    // Lines but the toolchain, so it gets its own HTML rather than a route.
    rollupOptions: {
      input: {
        main: 'index.html',
        binding: 'binding.html',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
