import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5199', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run dev -- --strictPort', url: 'http://127.0.0.1:5199', reuseExistingServer: true },
});
