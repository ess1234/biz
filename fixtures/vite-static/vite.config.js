// 픽스처: 고객 Vite 사이트 흉내. 키·주소는 환경 변수(시나리오 biz_client_fixture.py 가 넣는다)
import imagemeta from '@imagemeta/vite';

export default {
  plugins: [imagemeta({
    apiBase: process.env.IMAGEMETA_API_BASE || 'https://dos-biz-stage.vercel.app/t23/v1',
    apiKey: process.env.IMAGEMETA_API_KEY,
    lang: process.env.IMAGEMETA_LANG || 'ko',
    cacheTtlSeconds: 3600,
  })],
  build: { outDir: 'dist', emptyOutDir: true },
  logLevel: 'warn',
};
