import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = import.meta.dirname;

export default defineConfig({
  root: webRoot,
  // どのパスに置いても動くよう、相対パスで出力する
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@core': `${webRoot}/../core/src/index.ts` },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    // Replit のプレビュー用ドメインから開けるようにする
    allowedHosts: true,
    // /core と /data は web の外にある
    fs: { allow: ['..'] },
  },
  preview: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
