const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel, waitForReaderRendered, readState } = require('./helpers/reader')
test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

test('章段子开关不限制本书评论，主开关使迟到书评失效', async ({ page }) => {
  const { calls } = await setupApiMock(page)
  await gotoReader(page)
  await waitForReaderRendered(page)
  await openPanel(page, 'settings')
  await page.locator('[data-setting=show_comments]').getByRole('button', { name: '关闭' }).click()
  await openPanel(page, 'annotations')
  await expect(page.getByRole('button', { name: '当前章评' })).toBeDisabled()
  await page.getByRole('button', { name: '本书评论', exact: true }).click()
  await expect(page.locator('.book-review-card')).toBeVisible()
  await expect.poll(() => calls.some(c => c.url.includes('/api/review/book/list'))).toBe(true)
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    r.$backend = () => new Promise(resolve => { window.finishBookReview = resolve })
    r.load_book_reviews()
    r.update_settings({ ...r.settings, notes_enabled: false })
    window.finishBookReview({ err: 'ok', data: { list: [{ id: 22, content: '迟到书评' }] } })
  })
  await expect.poll(() => readState(page, 'book_reviews')).toEqual([])
  await expect(page.locator('.book-review-card')).toBeHidden()
})

test('笔记开关有命名group、主从缩进和44px命中区域', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await openPanel(page, 'settings')
  for (const name of ['笔记', '加载章节段落评论', '选中后出现工具栏']) {
    const group = page.getByRole('group', { name, exact: true })
    await expect(group).toBeVisible()
    for (const button of await group.getByRole('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  const geometry = await page.evaluate(() => ['notes_enabled', 'show_comments'].map(key => document.querySelector(`#setting-${key}`).getBoundingClientRect().x))
  expect(geometry[1] - geometry[0]).toBe(16)
  const off = page.getByRole('group', { name: '笔记', exact: true }).getByRole('button', { name: '关闭' })
  await off.focus()
  await page.keyboard.press('Enter')
  await expect(off).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: '加载章节段落评论', exact: true }).getByRole('button', { name: '开启' })).toBeDisabled()
})

test('关闭章段子开关仍可提交书评，总开关阻止新提交和迟到写响应', async ({ page }) => {
  const { calls } = await setupApiMock(page, { 'POST /api/review/add': { err: 'ok', data: { id: 23, content: '子开关关闭后书评' } } })
  page.on('dialog', dialog => dialog.accept())
  await gotoReader(page)
  await waitForReaderRendered(page)
  await page.waitForFunction(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    return r.current_toc && r.book_id
  })
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    r.update_settings({ ...r.settings, show_comments: false })
    r.on_add_book_review('子开关关闭后书评')
  })
  await expect.poll(() => calls.filter(c => c.url === '/api/review/add').length).toBe(1)
  await expect.poll(() => readState(page, 'book_reviews')).toEqual([{ id: 23, content: '子开关关闭后书评' }])
  const pending = await page.evaluate(async () => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    let finish, count = 0
    r.$backend = () => { count++; return new Promise(resolve => { finish = resolve }) }
    r.on_add_book_review('关闭前已提交')
    r.update_settings({ ...r.settings, notes_enabled: false })
    r.on_add_book_review('关闭后不应提交')
    finish({ err: 'ok', data: { id: 24, content: '迟到写响应' } })
    await Promise.resolve()
    return { count, reviews: r.book_reviews }
  })
  expect(pending).toEqual({ count: 1, reviews: [] })
})

test('错误不显示空态，工具栏关闭的空态能进入设置，面板仅一个刷新入口', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await waitForReaderRendered(page)
  await openPanel(page, 'settings')
  await page.locator('[data-setting=show_selection_toolbar]').getByRole('button', { name: '关闭' }).click()
  await openPanel(page, 'annotations')
  await expect(page.getByRole('button', { name: '刷新笔记' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '划线笔记', exact: true })).toHaveCount(0)
  await expect(page.getByText('在正文中选择文字即可开始。')).toBeHidden()
  await page.getByRole('button', { name: '前往设置开启工具栏' }).click()
  await expect(page.locator('[data-setting=show_selection_toolbar]')).toBeVisible()
  await openPanel(page, 'annotations')
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    r.annotation_repository.load = async () => { throw new Error('测试读取失败') }
    return r.load_annotations()
  })
  await expect(page.getByRole('alert')).toContainText('测试读取失败')
  await expect(page.getByText('还没有划线或笔记')).toBeHidden()
  await expect(page.getByRole('button', { name: '前往设置开启工具栏' })).toBeHidden()
})

for (const theme of ['white', 'grey']) {
  test(`引用使用不透明正文token且有足够对比度 ${theme}`, async ({ page }) => {
    await setupApiMock(page)
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.evaluate(theme => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      r.update_settings({ ...r.settings, theme })
      r.annotations = [{ id: 'contrast', quote_text: '引用的文字需要清晰可读', chapter: '第一章' }]
      r.set_menu('annotations')
    }, theme)
    const quote = page.locator('.annotation-quote')
    await expect(quote).toBeVisible()
    const colors = await quote.evaluate(el => {
      const style = getComputedStyle(el)
      let parent = el, background
      while (parent) {
        background = getComputedStyle(parent).backgroundColor
        if (background !== 'rgba(0, 0, 0, 0)') break
        parent = parent.parentElement
      }
      return { color: style.color, opacity: style.opacity, background }
    })
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const fg = luminance(colors.color), bg = luminance(colors.background)
    expect(colors.opacity).toBe('1')
    expect((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
}
