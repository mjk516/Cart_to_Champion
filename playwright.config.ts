// 화면 흐름 자동 테스트(E2E). `npm run e2e`
// 개발 서버를 5181번 포트(이 컴퓨터에서만)로 따로 띄워 실제 브라우저로 핵심 흐름을 눌러 본다.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5181;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
