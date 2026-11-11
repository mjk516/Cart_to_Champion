import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // 상대 경로로 빌드해 어느 주소(GitHub Pages의 하위 경로 포함)에 올려도 동작한다
  base: './',
  server: { port: 5173 },
  test: { include: ['test/**/*.test.ts'] },
} as never);
