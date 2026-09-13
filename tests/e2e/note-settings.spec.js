const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel, readState, waitForReaderRendered } = require('./helpers/reader')

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
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: comments || toolbar, show_comments: comments, show_selection_toolbar: toolbar })
      await openPanel(page, 'settings')
      await page.locator('[data-setting=notes_enabled]').getByRole('button', { name: '关闭' }).click()
      await expect(page.locator('[data-setting=show_comments]').getByRole('button', { name: '开启' })).toBeDisabled()
      await page.reload()
      await waitForReaderRendered(page)
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: false, show_comments: comments, show_selection_toolbar: toolbar })
      await openPanel(page, 'settings')
      await page.locator('[data-setting=notes_enabled]').getByRole('button', { name: '开启' }).click()
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: true, show_comments: comments, show_selection_toolbar: toolbar })
    })
  }
}

for (const enabled of [true, false]) {
  for (const comments of [true, false]) {
    for (const toolbar of [true, false]) {
      test(`主从开关组合 ${enabled}/${comments}/${toolbar}`, async ({ page }) => {
        const { calls } = await setupApiMock(page)
        await page.addInitScript(settings => { localStorage.readerSettings = JSON.stringify(settings) }, {
          notes_enabled: enabled, show_comments: comments, show_selection_toolbar: toolbar,
        })
        await gotoReader(page)
        await waitForReaderRendered(page)
        await page.evaluate(() => {
          const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
          r.show_toolbar({ left: 20, top: 100, bottom: 130 }, { x: 0, y: 0 })
          r.load_book_reviews()
        })
        await expect(page.locator('#comments-toolbar')).toBeVisible({ visible: enabled && toolbar })
        await expect(page.locator('.v-bottom-navigation button')).toHaveText(['目录', '夜晚', '笔记', '设置'])
        if (!enabled || !comments) expect(calls.filter(c => /review\/(summary|list)/.test(c.url))).toEqual([])
        if (!enabled) expect(calls.filter(c => /review\/(book\/list|me)/.test(c.url))).toEqual([])
        else await expect.poll(() => calls.some(c => c.url.includes('review/book/list'))).toBe(true)
        if (enabled && comments) await expect.poll(() => calls.some(c => c.url.includes('review/summary'))).toBe(true)
        await openPanel(page, 'annotations')
        if (!enabled) await expect(page.getByText('笔记已关闭，已有数据会保留。')).toBeVisible()
        else await expect(page.getByRole('button', { name: '当前章评', exact: true })).toBeEnabled({ enabled: comments })
      })
    }
  }
}

test('关闭期间迟到的评论响应不能恢复图标或打开面板', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await waitForReaderRendered(page)
  await page.waitForFunction(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.current_toc)
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = r.rendition.getContents()[0]
    const toc = r.current_toc
    delete toc.load_time
    r.$backend = url => url.startsWith('/api/review/summary')
      ? new Promise(resolve => { window.finishReview = resolve })
      : Promise.resolve({ err: 'ok', data: { count: 0 } })
    window.pendingReview = r.load_comments_summary(contents, toc)
    r.update_settings({ ...r.settings, notes_enabled: false })
    r.update_settings({ ...r.settings, notes_enabled: true, show_comments: false })
    window.finishReview({ err: 'ok', data: { list: [{ segmentId: 0, count: 9 }], chapter_id: 77 } })
  })
  await page.evaluate(() => window.pendingReview)
  const icons = await page.evaluate(() => Array.from(document.querySelectorAll('#reader iframe')).reduce((n, f) => n + f.contentDocument.querySelectorAll('.comment-icon').length, 0))
  expect(icons).toBe(0)
  expect(await readState(page, 'comments')).toEqual([])
})
