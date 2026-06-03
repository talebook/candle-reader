// Playwright 配置：针对 candle-reader 的 UI mock 测试
// 后端接口全部通过路由拦截 mock，无需真实 talebook 服务。
const { defineConfig, devices } = require('@playwright/test')

// 默认 5001；本机若已有同名仓库占用该端口，可用 E2E_PORT 指向本仓库的 dev server。
const PORT = process.env.E2E_PORT || 5001
const BASE_URL = `http://localhost:${PORT}`

module.exports = defineConfig({
  testDir: './tests/e2e',
  // 阅读器加载 epub 较重，给单测留足时间
  timeout: 30 * 1000,
  expect: { timeout: 5 * 1000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // 阅读器是移动优先（viewport-fit=cover），用手机尺寸更贴近真实场景
    viewport: { width: 414, height: 896 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 414, height: 896 } },
    },
  ],

  // 自动拉起 vite dev server
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
})
