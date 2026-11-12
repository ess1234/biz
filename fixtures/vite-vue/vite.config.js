// 픽스처: 고객 Vue 사이트 흉내. 키·주소는 환경 변수(check.mjs 가 넣는다)
import vue from '@vitejs/plugin-vue';
import imagemeta from '@imagemeta/vite';

export default {
  plugins: [
    imagemeta({
      apiBase: process.env.IMAGEMETA_API_BASE, // 필수 — 기본 주소 없음 (DA-3)
      apiKey: process.env.IMAGEMETA_API_KEY,
      lang: process.env.IMAGEMETA_LANG || 'ko',
      cacheTtlSeconds: 3600,
    }),
    vue(),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
  logLevel: 'warn',
};
