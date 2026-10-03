const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { HARNESS_URL, openPanel, waitForReaderRendered } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

for (const [chapter, label] of [['chapter.xhtml', '未收录的章节'], ['bare.xhtml', '正文 3']]) {
  test(`缺目录 ${chapter} 保存整段评论、刷新和开关后的标记`, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await setupApiMock(page)
    await page.goto(`${HARNESS_URL}?missing_toc=1`)
    await waitForReaderRendered(page)
    await page.evaluate(async chapter => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      await r.rendition.display(chapter)
    }, chapter)
    // A rendered comment count must neither execute markup nor change the
    // fallback chapter label used to save and reload annotations.
    const comment = await page.evaluate(chapter => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      const contents = r.rendition.getContents().find(c => r.book.spine.get(c.sectionIndex).href === chapter)
      const element = contents.document.querySelector('h1') || contents.document.getElementById('passage')
      const cfi = new window.ePub.CFI(element, contents.cfiBase)
      const toc = r.find_toc(cfi, contents)
      const count = '<img src=x onerror="window.__injected=true">'
      r.add_icon_into_paragraph(contents, element, { paragraph_cfi: cfi.toString(), count }, toc)
      return {
        text: element.querySelector('.comment-count').textContent,
        images: element.querySelectorAll('.comment-count img').length,
        chapter: r.find_toc(cfi, contents).label,
      }
    }, chapter)
    expect(comment).toEqual({ text: '<img src=x onerror="window.__injected=true">', images: 0, chapter: label })
    const selection = await page.evaluate(chapter => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      const contents = r.rendition.getContents().find(c => r.book.spine.get(c.sectionIndex).href === chapter)
      const element = contents.document.getElementById('passage')
      const range = contents.document.createRange()
      range.setStart(element.firstChild, 2)
      range.setEnd(element.firstChild, 18)
      const selection = contents.document.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      const paragraphRange = contents.document.createRange()
      paragraphRange.setStart(element.firstChild, 0)
      paragraphRange.setEnd(element.firstChild, element.firstChild.length)
      return { cfi: contents.cfiFromRange(paragraphRange), quote: element.firstChild.textContent }
    }, chapter)
    const toolbar = page.locator('#comments-toolbar')
    await expect(toolbar).toBeVisible()
    await toolbar.getByRole('button', { name: '写评论' }).click()
    await page.getByLabel('评论内容').fill('缺目录也能保存真实选区')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('评论已保存')).toBeVisible()
    const saved = await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ cfi: selection.cfi, quote_text: selection.quote, chapter: label })

    // Two distinct notes can refer to the same range. Keep both records while
    // rendering only one removable epub.js mark for the shared CFI.
    await page.evaluate(() => {
      const key = 'candle-reader:annotations:v1:101'
      const records = JSON.parse(localStorage[key])
      records.push({ ...records[0], id: 'same-cfi-second-note', client_id: 'same-cfi-second-note', content: '同一选区的第二条笔记' })
      localStorage[key] = JSON.stringify(records)
    })

    await page.reload()
    await waitForReaderRendered(page)
    await page.evaluate(async cfi => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      await r.rendition.display(cfi)
    }, selection.cfi)
    await expect(page.locator('.candle-reader-annotation')).toHaveCount(1)
    await openPanel(page, 'settings')
    const row = page.locator('[data-setting=notes_enabled]')
    await row.getByRole('switch').uncheck()
    await expect(page.locator('.candle-reader-annotation')).toHaveCount(0)
    await row.getByRole('switch').check()
    await expect(page.locator('.candle-reader-annotation')).toHaveCount(1)
    expect(await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']).length)).toBe(2)
    expect(errors).toEqual([])
  })
}
