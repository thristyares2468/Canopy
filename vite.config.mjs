import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        shell: resolve(import.meta.dirname, 'index.html'),
        newtab: resolve(import.meta.dirname, 'newtab.html')
      }
    }
  }
});
