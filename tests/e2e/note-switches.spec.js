const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel } = require('./helpers/reader')
test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

test('滑动开关有完整描述，支持键盘操作，两个评论开关互相独立', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await openPanel(page, 'settings')
  if (process.env.TB199_EVIDENCE_DIR) {
    await page.locator('[data-setting=show_selection_toolbar]').scrollIntoViewIfNeeded()
    const directory = path.resolve(process.env.TB199_EVIDENCE_DIR)
    fs.mkdirSync(directory, { recursive: true })
    await page.screenshot({ path: path.join(directory, 'tb199-settings-402x874.png') })
  }
  await expect(page.locator('[data-setting]')).toHaveCount(3)
  for (const name of ['使用鼠标滚轮翻页', '显示全部划线和评论', '选中文字后显示工具栏']) {
    await expect(page.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  const geometry = await page.evaluate(() => ['wheel_paging', 'show_comments', 'show_selection_toolbar'].map(key => document.querySelector(`#setting-${key}`).getBoundingClientRect().x))
  expect(geometry[1]).toBe(geometry[0])
  expect(geometry[2]).toBe(geometry[0])
  // 两个开关互相独立，都可以用键盘或点击文字切换。
  const comments = page.getByRole('switch', { name: '显示全部划线和评论', exact: true })
  await comments.focus()
  await page.keyboard.press('Space')
  await expect(comments).not.toBeChecked()
  await expect(page.getByRole('switch', { name: '选中文字后显示工具栏', exact: true })).toBeEnabled()
  await expect(page.getByRole('switch', { name: '选中文字后显示工具栏', exact: true })).toBeChecked()
  await page.locator('label[for="switch-show_comments"]').click()
  await expect(comments).toBeChecked()
})
