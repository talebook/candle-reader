const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, gotoHostReader, openPanel, readState, waitForReaderRendered } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

for (const comments of [true, false]) {
  for (const toolbar of [true, false]) {
    test(`旧设置迁移并保存偏好 comments=${comments} annotations=${toolbar}`, async ({ page }) => {
      await setupApiMock(page)
      await page.addInitScript(({ comments, toolbar }) => {
        if (!localStorage.readerSettings) localStorage.readerSettings = JSON.stringify({ show_comments: comments, show_annotations: toolbar })
      }, { comments, toolbar })
      await gotoReader(page)
      await waitForReaderRendered(page)
      const settings = await readState(page, 'settings')
      expect(settings).toMatchObject({ show_comments: comments, show_selection_toolbar: toolbar })
      expect(settings).not.toHaveProperty('notes_enabled')
      expect(settings).not.toHaveProperty('show_annotations')
    })
  }
}

test('曾关闭旧总开关的读者迁移后两项都关闭，重新打开后不会被旧值压回去', async ({ page }) => {
  await setupApiMock(page)
  await page.addInitScript(() => {
    if (!localStorage.readerSettings) localStorage.readerSettings = JSON.stringify({ notes_enabled: false, show_comments: true, show_selection_toolbar: true })
  })
  await gotoReader(page)
  await waitForReaderRendered(page)
  expect(await readState(page, 'settings')).toMatchObject({ show_comments: false, show_selection_toolbar: false })
  await openPanel(page, 'settings')
  await page.locator('[data-setting=show_comments]').getByRole('switch').check()
  await page.reload()
  await waitForReaderRendered(page)
  expect(await readState(page, 'settings')).toMatchObject({ show_comments: true, show_selection_toolbar: false })
  expect(await page.evaluate(() => JSON.parse(localStorage.readerSettings))).not.toHaveProperty('notes_enabled')
})

for (const comments of [true, false]) {
  for (const toolbar of [true, false]) {
    test(`开关组合 显示评论=${comments} 工具栏=${toolbar}`, async ({ page }) => {
      await setupApiMock(page)
      await page.addInitScript(settings => { localStorage.readerSettings = JSON.stringify(settings) }, {
        show_comments: comments, show_selection_toolbar: toolbar,
      })
      await gotoHostReader(page)
      await page.evaluate(() => {
        const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
        r.show_toolbar({ left: 20, top: 100, bottom: 130 }, { x: 0, y: 0 })
      })
      await expect(page.locator('#comments-toolbar')).toBeVisible({ visible: toolbar })
      await expect(page.locator('.v-bottom-navigation button')).toHaveText(['目录', '夜晚', '评论', '设置'])
      const operations = () => page.evaluate(() => window.__host.calls.map(call => call.operation))
      // 正文里的划线标记（load）和段尾气泡数量（summary）只在「显示全部划线和评论」开启时读取。
      if (comments) {
        await expect.poll(async () => (await operations()).includes('summary')).toBe(true)
        await expect.poll(async () => (await operations()).includes('load')).toBe(true)
      } else {
        expect((await operations()).filter(name => name === 'summary' || name === 'load')).toEqual([])
      }
      // 评论入口始终可用。
      await page.locator('.v-bottom-navigation').getByRole('button', { name: '评论' }).click()
      await expect(page.locator('.reader-comments-drawer .comment-item')).toHaveCount(3)
    })
  }
}

test('关闭期间迟到的评论数量响应不能恢复段尾气泡', async ({ page }) => {
  await setupApiMock(page)
  await gotoHostReader(page)
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const toc = r.current_toc
    const contents = r.rendition.getContents().find(c => c.document === toc.elem.ownerDocument)
    delete toc.load_time
    const cfi = r.paragraph_location(toc.elem, contents).paragraph_cfi
    r.annotation_repository.summary = () => new Promise(resolve => { window.finishSummary = () => resolve([{ paragraph_cfi: cfi, count: 9 }]) })
    window.pendingSummary = r.load_comments_summary(contents, toc)
    r.update_settings({ ...r.settings, show_comments: false })
    window.finishSummary()
  })
  await page.evaluate(() => window.pendingSummary)
  const icons = () => page.evaluate(() => Array.from(document.querySelectorAll('#reader iframe')).reduce((n, f) => n + f.contentDocument.querySelectorAll('.comment-icon').length, 0))
  expect(await icons()).toBe(0)
  // 重新开启后气泡恢复。
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    r.update_settings({ ...r.settings, show_comments: true })
    window.finishSummary()
  })
  await expect.poll(icons).toBe(1)
})
