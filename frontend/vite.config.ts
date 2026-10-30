import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('.'), '');

  return {
    root: here('.'),
    define: {
      __WARLAND_SERVER_URL__: JSON.stringify(env.SERVER_URL ?? ''),
    },
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
      outDir: here('./dist'),
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
