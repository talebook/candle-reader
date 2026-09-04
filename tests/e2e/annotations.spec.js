const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { HARNESS_URL, gotoReader, openPanel, readState, waitForReaderRendered } = require('./helpers/reader')

function notesButton(page) {
  return page.locator('.v-bottom-navigation').getByRole('button', { name: /^笔记/ })
}

async function readerProxy(page) {
  return page.evaluateHandle(() => {
    const app = document.querySelector('#app').__vue_app__
    return app._instance.subTree.component.proxy
  })
}

test.beforeEach(async ({ page }) => {
  await setupApiMock(page)
})

test('未注入回调时按书保存到 localStorage 并在笔记面板显示', async ({ page }) => {
  await gotoReader(page)
  await expect(page.locator('#comments-toolbar')).toBeHidden()
  await waitForReaderRendered(page)
  const proxy = await readerProxy(page)
  await proxy.evaluate(async (reader) => {
    reader.selected_location = {
      client_id: 'local-highlight-1',
      toc: { label: '第一章' },
      cfi: reader.rendition.currentLocation().start.cfi,
      quote_text: '本地划线原文',
      contents: null,
      segment_id: 0,
    }
    await reader.save_highlight()
  })

  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.startsWith('candle-reader:annotations:v1:'))
    return key ? JSON.parse(localStorage.getItem(key)) : []
  })
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ client_id: 'local-highlight-1', quote_text: '本地划线原文' })

  await notesButton(page).click()
  await expect(page.getByRole('dialog', { name: '阅读笔记' })).toBeVisible()
  await expect(page.getByText('本地划线原文')).toBeVisible()
})

test('宿主回调负责读取和写入，且收到书籍上下文', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?annotation_callbacks=1`)
  await notesButton(page).waitFor({ state: 'visible' })
  await notesButton(page).click()
  await expect(page.getByText('由宿主回调读取的笔记')).toBeVisible()

  await waitForReaderRendered(page)
  const proxy = await readerProxy(page)
  await proxy.evaluate((reader) => {
    reader.set_menu('hide')
    reader.selected_location = {
      client_id: 'callback-note-1',
      toc: { label: '第一章' },
      cfi: reader.rendition.currentLocation().start.cfi,
      quote_text: '回调写入原文',
      contents: null,
      segment_id: 0,
    }
    reader.show_toolbar({ left: 16, top: 96, bottom: 120 }, { x: 0, y: 0 })
  })
  await expect(page.locator('#comments-toolbar').getByRole('button', { name: '划线' })).toBeFocused()
  await page.locator('#comments-toolbar').getByRole('button', { name: '笔记', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '添加笔记' })).toBeVisible()
  await expect(page.getByLabel('公开给其他用户')).toBeVisible()
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByText('请填写笔记内容')).toBeVisible()
  await expect(page.getByLabel('笔记内容')).toBeFocused()
  await page.getByLabel('笔记内容').fill('回调写入内容')
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByText('笔记已保存')).toBeVisible()

  const calls = await page.evaluate(() => window.__annotationCalls)
  expect(calls.some(call => call.operation === 'load' && call.query.book_id === 101)).toBe(true)
  const save = calls.find(call => call.operation === 'save')
  expect(save.annotation).toMatchObject({ client_id: 'callback-note-1', content: '回调写入内容' })
  expect(save.context).toMatchObject({ book_id: 101, book_url: '/demo/book1.epub' })
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('candle-reader:annotations:v1:')))).toBe(false)
})

test('笔记面板提供空状态、加载状态和可重试错误', async ({ page }) => {
  await gotoReader(page)
  await notesButton(page).click()
  await expect(page.getByText('还没有划线或笔记')).toBeVisible()
  await expect(page.getByText('在正文中选择文字即可开始。')).toBeVisible()

  const proxy = await readerProxy(page)
  await proxy.evaluate((reader) => {
    reader.annotation_repository.load = () => new Promise((resolve, reject) => {
      window.__finishAnnotationLoad = () => reject(new Error('模拟读取失败'))
    })
    reader.load_annotations()
  })
  await expect(page.locator('.annotation-panel')).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => window.__finishAnnotationLoad())
  await expect(page.getByText('模拟读取失败')).toBeVisible()
  await expect(page.locator('.annotation-panel')).toHaveAttribute('aria-busy', 'false')
  await proxy.evaluate((reader) => { reader.annotation_repository.load = async () => [] })
  await page.getByRole('button', { name: '刷新笔记' }).click()
  await expect(page.getByText('模拟读取失败')).toBeHidden()
  await expect(page.getByText('还没有划线或笔记')).toBeVisible()
})

test('设置可以关闭并重新开启划线笔记功能', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  const annotationRow = page.locator('.v-list-item').filter({ hasText: '划线笔记' })
  await annotationRow.getByRole('button', { name: '关闭' }).click()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.show_annotations)).toBe(false)
  await expect(notesButton(page)).toHaveCount(0)

  await annotationRow.getByRole('button', { name: '开启' }).click()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.show_annotations)).toBe(true)
  await expect(notesButton(page)).toBeVisible()
})
