// 阅读器基础 UI：底部导航与各面板的打开/切换。
// 这些 UI 是静态模板，不依赖 epub 渲染，因此用例稳定。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, readState, waitForBookReady } = require('./helpers/reader')

test.beforeEach(async ({ page }) => {
  await setupApiMock(page) // 默认游客态
})

test('页面加载后底部导航栏可见', async ({ page }) => {
  await gotoReader(page)
  await expect(page.getByRole('button', { name: '目录' })).toBeVisible()
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '用户' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI' })).toBeVisible()
})

test('点击「设置」打开设置面板', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByText('亮度')).toBeVisible()
  await expect(page.getByText('翻页')).toBeVisible()
})

test('点击「AI」打开开发中占位面板', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: 'AI', exact: true }).click()
  await expect(page.getByText('开发中')).toBeVisible()
})

test('再次点击同一导航项可关闭面板', async ({ page }) => {
  await gotoReader(page)
  const settingsBtn = page.getByRole('button', { name: '设置' })
  await settingsBtn.click()
  await expect(page.getByText('亮度')).toBeVisible()
  // set_menu 对当前已打开的面板再次点击会切到 'hide'
  await settingsBtn.click()
  await expect(page.getByText('亮度')).toBeHidden()
})

test('设置面板可调整字号', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '设置' }).click()
  const before = await readState(page, 'settings')
  await page.getByRole('button', { name: 'A+' }).click()
  const after = await readState(page, 'settings')
  expect(after.font_size).toBe(before.font_size + 2)
})

// 以下用例会调用 rendition.*（epub.js），headless 下渲染不完整，暂跳过待讨论。
test.skip('设置面板可切换翻页模式 @epub', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByRole('button', { name: '上下滑动' }).click()
  await expect.poll(() => readState(page, 'settings').then(s => s.flow)).toBe('scrolled')
})

test.skip('点击主题按钮在白天/夜晚间切换 @epub', async ({ page }) => {
  await gotoReader(page)
  const before = await readState(page, 'settings').then(s => s.theme_mode)
  // 底部导航第二个按钮是主题切换（无 value，文案为 夜晚/白天）
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => readState(page, 'settings').then(s => s.theme_mode)).not.toBe(before)
})
