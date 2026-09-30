const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { setupApiMock } = require('./helpers/mock-api')
const { HARNESS_URL, gotoReader, openPanel, readState, waitForReaderRendered } = require('./helpers/reader')
test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

async function captureEvidence(page, name) {
  if (!process.env.TB199_EVIDENCE_DIR) return
  const directory = path.resolve(process.env.TB199_EVIDENCE_DIR)
  fs.mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, name) })
}

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
      paragraph_cfi: reader.rendition.currentLocation().start.cfi,
      paragraph_quote_text: '回调写入整段原文',
      contents: null,
      segment_id: 0,
    }
    reader.show_toolbar({ left: 16, top: 96, bottom: 120 }, { x: 0, y: 0 })
  })
  await expect(page.locator('#comments-toolbar').getByRole('button', { name: '复制' })).toBeFocused()
  await page.locator('#comments-toolbar').getByRole('button', { name: '写想法' }).click()
  await expect(page.getByRole('dialog', { name: '写笔记' })).toBeVisible()
  const publicSwitch = page.getByRole('switch', { name: '公开这条笔记' })
  await expect(publicSwitch).toBeChecked()
  await expect(page.getByText('笔记关联整个段落。')).toBeVisible()
  await expect(page.getByText('其他读者可在此段落看到这条笔记。')).toBeVisible()
  await page.getByRole('switch', { name: '公开这条笔记' }).uncheck()
  await expect(page.getByText('只有你能看到这条笔记。')).toBeVisible()
  await publicSwitch.focus()
  await page.keyboard.press('Space')
  await expect(publicSwitch).toBeChecked()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('请填写笔记内容')).toBeVisible()
  await expect(page.getByLabel('笔记内容')).toBeFocused()
  await page.getByLabel('笔记内容').fill('回调写入内容')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('笔记已保存')).toBeVisible()

  const calls = await page.evaluate(() => window.__annotationCalls)
  expect(calls.some(call => call.operation === 'load' && call.query.book_id === 101)).toBe(true)
  const save = calls.find(call => call.operation === 'save')
  expect(save.annotation).toMatchObject({ client_id: 'callback-note-1', content: '回调写入内容', is_private: false })
  expect(save.context).toMatchObject({ book_id: 101, book_url: '/demo/book1.epub' })
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('candle-reader:annotations:v1:')))).toBe(false)
})

test('真实选区在工具栏和编辑弹窗中可见，写入失败不产生永久标记', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
  })
  const selectionInfo = await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const text = contents.document.getElementById('passage').firstChild
    const range = contents.document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, Math.min(14, text.textContent.length))
    const selection = contents.document.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return { cfi: contents.cfiFromRange(range), ...reader.paragraph_for_range(range, contents) }
  })
  const toolbar = page.locator('#comments-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  expect(await toolbar.getByRole('button').allTextContents()).toEqual(expect.arrayContaining(['复制', '划线', '写想法', '看想法']))
  await captureEvidence(page, 'tb199-toolbar-402x874.png')
  await toolbar.getByRole('button', { name: '写想法' }).click()
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  await captureEvidence(page, 'tb199-editor-402x874.png')
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.selected_location.cfi)).toBe(selectionInfo.cfi)
  await expect(page.locator('.annotation-editor-quote')).toHaveText(selectionInfo.paragraph_quote_text)
  await expect(page.getByText('仅保存在当前浏览器，公开范围暂不生效。')).toBeVisible()
  await expect(page.getByText('其他读者可在此段落看到这条笔记。')).toBeHidden()
  await page.getByLabel('笔记内容').fill('保存失败时保持选区')
  await page.getByRole('switch', { name: '公开这条笔记' }).uncheck()
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    window.__originalAnnotationSave = reader.annotation_repository.save
    reader.annotation_repository.save = async () => { throw new Error('模拟写入失败') }
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('保存失败：模拟写入失败')).toBeVisible()
  await expect(page.locator('.candle-reader-annotation')).toHaveCount(0)
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  await captureEvidence(page, 'tb199-save-failed-402x874.png')
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    reader.annotation_repository.save = window.__originalAnnotationSave
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.candle-reader-annotation')).toHaveCount(1)
  await expect(page.locator('.selection-preview')).toHaveCount(0)
  await expect.poll(() => readState(page, 'annotation_editor_location')).toBe(null)
  await captureEvidence(page, 'tb199-saved-402x874.png')
  const saved = await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']))
  expect(saved[0]).toMatchObject({ cfi: selectionInfo.paragraph_cfi, quote_text: selectionInfo.paragraph_quote_text, annotation_type: 'note', is_private: true, content: '保存失败时保持选区' })
  await page.evaluate(savedCfi => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    reader.selected_location = { cfi: savedCfi, paragraph_cfi: savedCfi, quote_text: '再次查看同一段落' }
    reader.show_toolbar({ left: 16, top: 100, bottom: 120 }, { x: 0, y: 0 })
  }, selectionInfo.paragraph_cfi)
  await toolbar.getByRole('button', { name: '看想法' }).click()
  await expect(page.getByText('此处笔记')).toBeVisible()
  await expect(page.getByText('保存失败时保持选区')).toBeVisible()
  await page.getByRole('button', { name: '查看全部' }).click()
  await expect(page.getByText('此处笔记')).toBeHidden()
})

test('划线等待写入成功才显示标记，成功后不弹保存提示', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const text = contents.document.getElementById('passage').firstChild
    const range = contents.document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 12)
    const selection = contents.document.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const originalSave = reader.annotation_repository.save
    reader.annotation_repository.save = annotation => new Promise(resolve => {
      window.__finishHighlightSave = () => originalSave(annotation).then(resolve)
    })
  })
  await page.locator('#comments-toolbar').getByRole('button', { name: '划线' }).click()
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  await expect(page.locator('.candle-reader-annotation')).toHaveCount(0)
  await page.evaluate(() => window.__finishHighlightSave())
  await expect(page.locator('.candle-reader-annotation')).toHaveCount(1)
  await expect(page.locator('.selection-preview')).toHaveCount(0)
  await expect(page.getByText('划线已保存')).toHaveCount(0)
})

test('笔记面板提供空状态、加载状态和可重试错误', async ({ page }) => {
  await gotoReader(page)
  await waitForReaderRendered(page)
  await notesButton(page).click()
  await expect(page.getByText('还没有划线或笔记')).toBeVisible()
  await expect(page.getByText('在正文中选择文字即可开始。')).toBeVisible()

  const proxy = await readerProxy(page)
  await proxy.evaluate((reader) => {
    reader.annotation_repository.load = () => new Promise((resolve, reject) => {
      if (window.__annotationLoadFailed) return reject(new Error('模拟读取失败'))
      window.__finishAnnotationLoad = () => {
        window.__annotationLoadFailed = true
        reject(new Error('模拟读取失败'))
      }
    })
    reader.load_annotations()
  })
  await expect(page.locator('.annotation-panel')).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => window.__finishAnnotationLoad())
  await expect.poll(() => readState(page, 'annotations_error')).toBe('模拟读取失败')
  await expect.poll(() => readState(page, 'annotations_loading')).toBe(false)
  await expect(page.getByText('模拟读取失败', { exact: false })).toBeVisible()
  await expect(page.getByText('还没有划线或笔记')).toBeHidden()
  await expect(page.locator('.annotation-panel')).toHaveAttribute('aria-busy', 'false')
  await proxy.evaluate((reader) => { reader.annotation_repository.load = async () => [] })
  await page.getByRole('button', { name: '刷新笔记' }).click()
  await expect(page.getByText('模拟读取失败')).toBeHidden()
  await expect(page.getByText('还没有划线或笔记')).toBeVisible()
})

test('设置可以关闭并重新开启划线笔记功能', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  const annotationRow = page.locator('[data-setting=notes_enabled]')
  await annotationRow.getByRole('switch').uncheck()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.notes_enabled)).toBe(false)
  await expect(notesButton(page)).toBeVisible()

  await annotationRow.getByRole('switch').check()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.notes_enabled)).toBe(true)
  await expect(notesButton(page)).toBeVisible()
})

test('同段不同选区共享整段笔记范围，跨段只能保存私密划线', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const paragraph = contents.document.getElementById('passage')
    paragraph.innerHTML = '段落开头<strong>中间的重点</strong>以及段落结尾。'
    const other = contents.document.createElement('p')
    other.id = 'other-passage'
    other.textContent = '另一个段落的文字。'
    paragraph.after(other)
  })
  async function select(startOffset, endOffset, crossParagraph = false) {
    return page.evaluate(({ startOffset, endOffset, crossParagraph }) => {
      const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
      const paragraph = contents.document.getElementById('passage')
      const range = contents.document.createRange()
      range.setStart(paragraph.firstChild, startOffset)
      range.setEnd(crossParagraph ? contents.document.getElementById('other-passage').firstChild : paragraph.querySelector('strong').firstChild, endOffset)
      const selection = contents.document.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      const full = contents.document.createRange()
      full.setStart(paragraph.firstChild, 0)
      full.setEnd(paragraph.lastChild, paragraph.lastChild.length)
      return { cfi: contents.cfiFromRange(range), quote: range.toString(), fullCfi: contents.cfiFromRange(full), fullQuote: paragraph.textContent }
    }, { startOffset, endOffset, crossParagraph })
  }
  const first = await select(1, 3)
  const toolbar = page.locator('#comments-toolbar')
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '写想法' }).click()
  await expect(page.locator('.annotation-editor-quote')).toHaveText(first.fullQuote)
  await page.getByLabel('笔记内容').fill('这个段落的公开笔记')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '写笔记' })).toBeHidden()
  await expect.poll(() => readState(page, 'annotation_editor_location')).toBe(null)
  const second = await select(2, 5)
  expect(second.cfi).not.toBe(first.cfi)
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '看想法' }).click()
  await expect(page.getByText('这个段落的公开笔记')).toBeVisible()
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '阅读笔记' })).toBeHidden()

  const cross = await select(1, 4, true)
  await expect(toolbar).toBeVisible()
  await expect(toolbar.getByRole('button', { name: '写想法' })).toBeDisabled()
  await expect(toolbar.getByRole('button', { name: '看想法' })).toBeDisabled()
  await toolbar.getByRole('button', { name: '划线', exact: true }).click()
  await expect(toolbar).toBeHidden()
  const saved = await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']))
  expect(saved).toHaveLength(2)
  expect(saved[0]).toMatchObject({ annotation_type: 'note', cfi: first.fullCfi, quote_text: first.fullQuote, is_private: false })
  expect(saved[1]).toMatchObject({ annotation_type: 'highlight', cfi: cross.cfi, quote_text: cross.quote, is_private: true, content: '' })
})
