import chairUrl from './assets/chair.webp';   // 모듈 import — CLI 는 바꾸지 않는다

export function App() {
  return (
    <main>
      <img src="/images/hero.jpg" className="hero" />
      <img src={'/images/secret.jpg'} />
      <img src={chairUrl} />
    </main>
  );
}
