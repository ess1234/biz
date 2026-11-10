import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬: dos(T23_PRODUCT=biz) 를 BIZ_API_BASE 로 (기본 127.0.0.1:8000). 운영은 vercel.json rewrite.
const target = process.env.BIZ_API_BASE || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy: { '/t23/v1': { target, changeOrigin: true } } },
  preview: { port: 4174, strictPort: true, proxy: { '/t23/v1': { target, changeOrigin: true } } },
});
