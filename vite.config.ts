import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wiki: resolve(__dirname, 'wiki/index.html'),
        confirmRedirect: resolve(__dirname, 'confirm-redirect.html'),
      },
    },
  },
});
