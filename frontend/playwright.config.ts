import { defineConfig, devices } from '@playwright/test'

/** Порт фронтенда (vite dev) для e2e-прогона. */
const FRONTEND_PORT = 4173
/** Порт бэкенда; должен совпадать с прокси в vite.config.ts. */
const BACKEND_PORT = 8080

export default defineConfig({
  testDir: './e2e',
  // Бэкенд хранит данные в памяти одного процесса, поэтому тесты идут
  // последовательно: изоляция через фикстуры, а не через параллельных воркеров.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // Интерфейс отображает время в UTC; фиксируем зону браузера для детерминизма.
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'go run .',
      cwd: '../backend',
      url: `http://localhost:${BACKEND_PORT}/api/event-types`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
