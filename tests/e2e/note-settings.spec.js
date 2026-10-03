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
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: comments || toolbar, show_comments: comments, show_selection_toolbar: toolbar })
      await openPanel(page, 'settings')
      await page.locator('[data-setting=notes_enabled]').getByRole('switch').uncheck()
      await expect(page.locator('[data-setting=show_comments]').getByRole('switch')).toBeDisabled()
      await page.reload()
      await waitForReaderRendered(page)
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: false, show_comments: comments, show_selection_toolbar: toolbar })
      await openPanel(page, 'settings')
      await page.locator('[data-setting=notes_enabled]').getByRole('switch').check()
      expect(await readState(page, 'settings')).toMatchObject({ notes_enabled: true, show_comments: comments, show_selection_toolbar: toolbar })
    })
  }
}

for (const enabled of [true, false]) {
  for (const comments of [true, false]) {
    for (const toolbar of [true, false]) {
      test(`主从开关组合 ${enabled}/${comments}/${toolbar}`, async ({ page }) => {
        await setupApiMock(page)
        await page.addInitScript(settings => { localStorage.readerSettings = JSON.stringify(settings) }, {
          notes_enabled: enabled, show_comments: comments, show_selection_toolbar: toolbar,
        })
        await gotoHostReader(page)
        await page.evaluate(() => {
          const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
          r.show_toolbar({ left: 20, top: 100, bottom: 130 }, { x: 0, y: 0 })
        })
        await expect(page.locator('#comments-toolbar')).toBeVisible({ visible: enabled && toolbar })
        await expect(page.locator('.v-bottom-navigation button')).toHaveText(['目录', '夜晚', '评论', '设置'])
        const operations = () => page.evaluate(() => window.__host.calls.map(call => call.operation))
        // 段尾气泡的数量只在主开关和「显示全部划线和评论」都开启时加载；主开关关闭时不读取任何评论数据。
        if (enabled && comments) await expect.poll(async () => (await operations()).includes('summary')).toBe(true)
        else expect((await operations()).includes('summary')).toBe(false)
        if (enabled) await expect.poll(async () => (await operations()).includes('load')).toBe(true)
        else expect((await operations()).filter(name => name !== 'user')).toEqual([])
        await openPanel(page, 'annotations')
        if (!enabled) {
          await expect(page.getByText('评论已关闭，已有数据会保留。')).toBeVisible()
          await expect(page.locator('.reader-comments-drawer')).toBeHidden()
          expect((await operations()).includes('list')).toBe(false)
          await page.getByRole('button', { name: '前往设置' }).click()
          await expect(page.locator('[data-setting=notes_enabled]')).toBeVisible()
        } else {
          await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.open_comments('chapter'))
          await expect(page.locator('.reader-comments-drawer .comment-item')).toHaveCount(3)
        }
      })
    }
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
    r.update_settings({ ...r.settings, notes_enabled: false })
    r.update_settings({ ...r.settings, notes_enabled: true, show_comments: false })
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
