import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => {
    return {
      root: 'src',
      publicDir: '../public',
      server: {
        port: 3000,
        host: host || '0.0.0.0',
        strictPort: true,
      },
      plugins: [react(), tailwindcss()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      },
      build: {
        outDir: '../dist',
        emptyOutDir: true,
      },
      clearScreen: false,
      envPrefix: ['VITE_', 'TAURI_'],
    };
});
