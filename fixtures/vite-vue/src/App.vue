<script setup>
import { ref } from 'vue';
import ProductCard from './components/ProductCard.vue';

// 런타임 데이터로 오는 주소 — 빌드 연동이 못 잡는 경우(페이지 스크립트 · SSR 몫)
const products = ref([
  { id: 'p1', image: 'https://img.example-cdn.test/i/44444444-4444-4444-8444-444444444444?w=400' },
]);
const handAlt = '바인딩한 설명';
</script>

<template>
  <main>
    <!-- 1. 정적 img, alt 없음 → 빌드가 채움 -->
    <img id="v-static" src="https://img.example-cdn.test/i/11111111-1111-4111-8111-111111111111?w=800" />
    <!-- 2. 꾸밈말 경로 + 여러 속성 -->
    <img id="v-slug" class="hero" loading="lazy" src="https://img.example-cdn.test/i/22222222-2222-4222-8222-222222222222/green-tent?w=400&f=webp" width="400">
    <!-- 3. 손으로 쓴 alt → 유지 -->
    <img id="v-hand" src="https://img.example-cdn.test/i/11111111-1111-4111-8111-111111111111" alt="손으로 쓴 설명" />
    <!-- 4. :alt 바인딩 → 유지(덮지 않음) -->
    <img id="v-bound-alt" src="https://img.example-cdn.test/i/22222222-2222-4222-8222-222222222222" :alt="handAlt" />
    <!-- 5. :src 바인딩(런타임 데이터) → 손대지 않음 -->
    <img v-for="p in products" :id="'v-dyn-' + p.id" :key="p.id" :src="p.image" />
    <!-- 6. 비공개(서버가 missing) → alt 없음 -->
    <img id="v-private" src="https://img.example-cdn.test/i/99999999-9999-4999-8999-999999999999" />
    <!-- 7. 우리 이미지 아님 -->
    <img id="v-foreign" src="https://example.com/x.jpg" />
    <!-- 8. 자식 컴포넌트 안의 정적 img -->
    <ProductCard />
  </main>
</template>
