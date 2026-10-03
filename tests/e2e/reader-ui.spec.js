// 阅读器基础 UI：底部导航与各面板的打开/切换。
// 这些 UI 是静态模板，不依赖 epub 渲染，因此用例稳定。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, readState, waitForReaderRendered } = require('./helpers/reader')

test.beforeEach(async ({ page }) => {
  await setupApiMock(page) // 默认游客态
})

test('页面加载后底部导航栏可见', async ({ page }) => {
  await gotoReader(page)
  await expect(page.getByRole('button', { name: '目录' })).toBeVisible()
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation button')).toHaveText(['目录', '夜晚', '评论', '设置'])
})

test('点击「设置」打开设置面板', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByText('亮度')).toBeVisible()
  await expect(page.getByText('翻页', { exact: true })).toBeVisible()
})

test('顶部更多选项打开开发中占位面板', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '更多选项', exact: true }).click()
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

// 以下用例会调用 rendition.*（epub.js）。harness 改用解压目录后正文可稳定渲染，
// 先 waitForReaderRendered 再操作即可。
test('设置面板可切换翻页模式 @epub', async ({ page }) => {
  await gotoReader(page)
  await waitForReaderRendered(page)
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByRole('button', { name: '上下滑动' }).click()
  await expect.poll(() => readState(page, 'settings').then(s => s.flow)).toBe('scrolled')
})

test('设置面板可切换滚轮翻页', async ({ page }) => {
  await gotoReader(page)
  await page.getByRole('button', { name: '设置' }).click()
  const wheelRow = page.locator('.v-list-item').filter({ hasText: '滚轮翻页' })
  await wheelRow.getByRole('switch').uncheck()
  await expect.poll(() => readState(page, 'settings').then(s => s.wheel_paging)).toBe(false)
  await wheelRow.getByRole('switch').check()
  await expect.poll(() => readState(page, 'settings').then(s => s.wheel_paging)).toBe(true)
})

test('点击主题按钮在白天/夜晚间切换 @epub', async ({ page }) => {
  await gotoReader(page)
  await waitForReaderRendered(page)
  const before = await readState(page, 'settings').then(s => s.theme_mode)
  // 底部导航第二个按钮是主题切换（无 value，文案为 夜晚/白天）
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => readState(page, 'settings').then(s => s.theme_mode)).not.toBe(before)
})

test('左右翻页时拦截阅读区域外框的拖动，正文里不拦（保留 iOS 选区手柄），整页固定 @epub', async ({ page }) => {
  await gotoReader(page)
  await waitForReaderRendered(page)
  const prevented = () => page.evaluate(() => {
    const drag = target => {
      const doc = target.ownerDocument
      const touch = new (doc.defaultView.Touch)({ identifier: 1, target, clientX: 100, clientY: 100 })
      const event = new (doc.defaultView.TouchEvent)('touchmove', { cancelable: true, bubbles: true, touches: [touch] })
      return !target.dispatchEvent(event)
    }
    const sheet = document.querySelector('.v-overlay--active .v-overlay__content')
    return {
      iframe: drag(document.querySelector('#reader iframe').contentDocument.body),
      main: drag(document.querySelector('#main')),
      panel: sheet ? drag(sheet) : null,
    }
  })
  expect(await page.evaluate(() => ['position', 'overflow'].map(key => getComputedStyle(document.body)[key]))).toEqual(['fixed', 'hidden'])
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByText('亮度')).toBeVisible()
  expect(await prevented()).toEqual({ iframe: false, main: true, panel: false })
  await page.getByRole('button', { name: '上下滑动' }).click()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.flow)).toBe('scrolled')
  expect(await prevented()).toMatchObject({ iframe: false, main: false })
})

test('正文加载超过 60 秒提示「加载较慢」但不中断，加载完成后提示自动关闭', async ({ page }) => {
  let release
  const held = new Promise(resolve => { release = resolve })
  await page.route('**/demo/book1.epub', async route => { await held; await route.continue() })
  await page.clock.install()
  await gotoReader(page)
  const dialog = page.getByRole('dialog', { name: '加载较慢' })
  await page.clock.fastForward(59000)
  await expect(dialog).toHaveCount(0)
  await page.clock.fastForward(2000)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '继续等待' })).toBeVisible()
  await page.clock.resume()
  release()
  await waitForReaderRendered(page)
  await expect(dialog).toBeHidden()
})
