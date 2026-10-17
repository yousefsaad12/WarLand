import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': here('./src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: here('../frontend-dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
