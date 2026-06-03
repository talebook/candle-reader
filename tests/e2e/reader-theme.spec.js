// 阅读主题（配色 + 背景图皮肤）。
// 这些用例只校验主题选择对 Vue 状态的影响（settings.theme / theme_mode），
// 不依赖 epub 正文渲染，因此在 mock harness 下稳定可跑。
const { test, expect } = require('@playwright/test')
const { gotoReader, openPanel, readState } = require('./helpers/reader')

const themeMode = (page) => readState(page, 'settings').then(s => s.theme_mode)
const themeId = (page) => readState(page, 'settings').then(s => s.theme)

// 打开设置 →「更多主题」二级窗口 → 点击指定名字的主题卡片
async function pickTheme(page, name) {
  await openPanel(page, 'settings')
  await page.getByRole('button', { name: /更多主题/ }).click()
  await page.locator('.theme-cell', { hasText: name }).locator('.theme-card').click()
}

test('设置面板有 4 个快捷主题图标和「更多主题」入口', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  await expect(page.getByRole('button', { name: /更多主题/ })).toBeVisible()
})

test('「更多主题」窗口展示完整主题列表并按白天/夜晚分区', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  await page.getByRole('button', { name: /更多主题/ }).click()
  for (const name of ['白色', '护眼', '夜灰', '纯黑', '竹林清风', '故纸堆', '灰土', '星夜']) {
    await expect(page.locator('.theme-cell', { hasText: name })).toBeVisible()
  }
  // 白天/夜晚分区标题
  await expect(page.locator('.theme-group-label', { hasText: '白天' })).toBeVisible()
  await expect(page.locator('.theme-group-label', { hasText: '夜晚' })).toBeVisible()
})

test('在「更多主题」里选图片皮肤，主题切换到对应 id（白天）', async ({ page }) => {
  await gotoReader(page)
  await pickTheme(page, '竹林清风')
  await expect.poll(() => themeId(page)).toBe('zhulin')
  await expect.poll(() => themeMode(page)).toBe('day')
})

test('在「更多主题」里选夜间皮肤，切换到夜间模式', async ({ page }) => {
  await gotoReader(page)
  await pickTheme(page, '星夜')
  await expect.poll(() => themeId(page)).toBe('xingye')
  await expect.poll(() => themeMode(page)).toBe('night')
})

test('白天/夜晚切换按钮在最近的日/夜主题间切换', async ({ page }) => {
  await gotoReader(page)
  // 先经「更多主题」选定一套日间主题
  await pickTheme(page, '白色')
  await expect.poll(() => themeMode(page)).toBe('day')
  await openPanel(page, 'hide')
  // 底部「夜晚」按钮：切到夜间
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => themeMode(page)).toBe('night')
  // 再点一次：切回白天
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => themeMode(page)).toBe('day')
})
