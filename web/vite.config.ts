import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to GitHub Pages at https://<user>.github.io/stellar-crowdfund/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/stellar-crowdfund/' : '/',
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
  },
}));
