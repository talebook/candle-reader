const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { setupApiMock } = require('./helpers/mock-api')
const { HARNESS_URL, HOST_URL, gotoReader, openPanel, readState, readerProxy, waitForReaderRendered } = require('./helpers/reader')
test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

async function captureEvidence(page, name) {
  if (!process.env.TB199_EVIDENCE_DIR) return
  const directory = path.resolve(process.env.TB199_EVIDENCE_DIR)
  fs.mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, name) })
}

function notesButton(page) {
  return page.locator('.v-bottom-navigation').getByRole('button', { name: '评论' })
}

test.beforeEach(async ({ page }) => {
  await setupApiMock(page)
})

test('选区工具栏优先放在上方，空间不足时放在下方并保持在屏幕内', async ({ page }) => {
  await gotoReader(page)
  const toolbar = page.locator('#comments-toolbar')
  const proxy = await readerProxy(page)
  for (const selection of [
    { left: 340, top: 70, bottom: 94, placement: 'above' },
    { left: 340, top: 20, bottom: 44, placement: 'below' },
  ]) {
    await proxy.evaluate((reader, rect) => {
      reader.show_toolbar(rect, { x: 0, y: 0 })
    }, selection)
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('button', { name: '复制' })).not.toBeFocused()
    const box = await toolbar.boundingBox()
    if (selection.placement === 'above') {
      expect(box.y + box.height).toBeLessThanOrEqual(selection.top)
      expect(selection.top - box.y - box.height).toBeLessThanOrEqual(16)
    } else {
      expect(box.y).toBeGreaterThanOrEqual(selection.bottom)
      expect(box.y - selection.bottom).toBeLessThanOrEqual(16)
    }
    expect(box.x).toBeGreaterThanOrEqual(8)
    expect(box.x + box.width).toBeLessThanOrEqual(394)
    expect(box.y).toBeGreaterThanOrEqual(8)
    await proxy.evaluate(reader => reader.hide_toolbar())
    await expect(toolbar).toBeHidden()
  }
})

test.describe('触屏设备', () => {
  test.use({ isMobile: true, hasTouch: true })
  test('工具栏优先放在选区下方，避开系统文字菜单；下方放不下时放上方', async ({ page }) => {
    await gotoReader(page)
    const toolbar = page.locator('#comments-toolbar')
    const proxy = await readerProxy(page)
    for (const selection of [
      { left: 40, top: 300, bottom: 324, placement: 'below' },
      // 底部菜单上方只剩不到一个工具栏的高度。
      { left: 40, top: 780, bottom: 804, placement: 'above' },
    ]) {
      await proxy.evaluate((reader, rect) => reader.show_toolbar(rect, { x: 0, y: 0 }), selection)
      await expect(toolbar).toBeVisible()
      const box = await toolbar.boundingBox()
      if (selection.placement === 'below') expect(box.y).toBeGreaterThanOrEqual(selection.bottom)
      else expect(box.y + box.height).toBeLessThanOrEqual(selection.top)
      await proxy.evaluate(reader => reader.hide_toolbar())
    }
  })
})

test('工具栏跟随段落中的实际选区位置', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  const selectionTop = await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const paragraph = contents.document.getElementById('passage')
    paragraph.style.width = '160px'
    paragraph.style.marginTop = '160px'
    const text = paragraph.firstChild
    const range = contents.document.createRange()
    range.setStart(text, text.length - 8)
    range.setEnd(text, text.length)
    const view = reader.rendition.views()._views.find(item => item.index === contents.sectionIndex)
    const top = range.getBoundingClientRect().top + view.iframe.getBoundingClientRect().top
    reader.on_select_content(contents.cfiFromRange(range), contents)
    return top
  })
  const toolbar = page.locator('#comments-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(toolbar.getByRole('button', { name: '复制' })).not.toBeFocused()
  const box = await toolbar.boundingBox()
  expect(box.y + box.height).toBeLessThanOrEqual(selectionTop)
  expect(selectionTop - box.y - box.height).toBeLessThanOrEqual(16)
})

test('未注入回调时按书保存到 localStorage，并出现在「我的」', async ({ page }) => {
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
  // 划线固定私密：不进入本章评论，只在「我的」里出现。
  await expect(page.locator('.reader-comments-drawer').getByText('这里还没有公开评论')).toBeVisible()
  await page.getByRole('button', { name: /查看更多评论/ }).click()
  const fullPage = page.getByRole('dialog', { name: '完整评论页' })
  await fullPage.getByRole('button', { name: '我的' }).click()
  await expect(fullPage.getByText('本地划线原文')).toBeVisible()
  await expect(fullPage.locator('.comment-tag')).toHaveText(['划线'])
  await expect(fullPage.locator('.comment-private')).toHaveText('私密')
})

test('宿主回调负责读取和写入，且收到书籍上下文', async ({ page }) => {
  await page.goto(HOST_URL)
  await waitForReaderRendered(page)
  const proxy = await readerProxy(page)
  await proxy.evaluate((reader) => {
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
  await expect(page.locator('#comments-toolbar')).toBeVisible()
  await expect(page.locator('#comments-toolbar').getByRole('button', { name: '复制' })).not.toBeFocused()
  await page.locator('#comments-toolbar').getByRole('button', { name: '写评论' }).click()
  await expect(page.getByRole('dialog', { name: '写评论' })).toBeVisible()
  const publicSwitch = page.getByRole('switch', { name: '公开这条评论' })
  await expect(publicSwitch).toBeChecked()
  await expect(page.getByText('评论关联整个段落。')).toBeVisible()
  await expect(page.getByText('其他读者可以在对应评论范围看到这条评论。')).toBeVisible()
  await publicSwitch.uncheck()
  await expect(page.getByText('只有你能看到这条评论。')).toBeVisible()
  await publicSwitch.focus()
  await page.keyboard.press('Space')
  await expect(publicSwitch).toBeChecked()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('请填写评论内容')).toBeVisible()
  await expect(page.getByLabel('评论内容')).toBeFocused()
  await page.getByLabel('评论内容').fill('回调写入内容')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('评论已保存')).toBeVisible()

  const calls = await page.evaluate(() => window.__host.calls)
  expect(calls.some(call => call.operation === 'load' && call.query.book_id === 101 && call.query.book_url === '/demo/book1.epub')).toBe(true)
  const save = calls.find(call => call.operation === 'save')
  expect(save.query).toMatchObject({ client_id: 'callback-note-1', annotation_type: 'note', content: '回调写入内容', is_private: false, quote_text: '回调写入整段原文' })
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
  expect(await toolbar.getByRole('button').allTextContents()).toEqual(expect.arrayContaining(['复制', '划线', '写评论', '看本段评论']))
  await captureEvidence(page, 'tb199-toolbar-402x874.png')
  await toolbar.getByRole('button', { name: '写评论' }).click()
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  await captureEvidence(page, 'tb199-editor-402x874.png')
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.selected_location.cfi)).toBe(selectionInfo.cfi)
  await expect(page.locator('.annotation-editor-quote')).toHaveText(selectionInfo.paragraph_quote_text)
  await expect(page.getByText('仅保存在当前浏览器，公开范围暂不生效。')).toBeVisible()
  await expect(page.getByText('其他读者可以在对应评论范围看到这条评论。')).toBeHidden()
  await page.getByLabel('评论内容').fill('保存失败时保持选区')
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
  // 文字评论不在正文铺底色，由段尾气泡表示。
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#reader iframe')).filter(f => f.contentDocument.querySelector('#passage .comment-icon')).length)).toBe(1)
  await expect(page.locator('.candle-reader-annotation')).toHaveCount(0)
  await expect(page.locator('.selection-preview')).toHaveCount(0)
  await expect.poll(() => readState(page, 'annotation_editor_location')).toBe(null)
  await captureEvidence(page, 'tb199-saved-402x874.png')
  const saved = await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']))
  expect(saved[0]).toMatchObject({ cfi: selectionInfo.paragraph_cfi, quote_text: selectionInfo.paragraph_quote_text, annotation_type: 'note', is_private: false, range_cfi: selectionInfo.cfi, content: '保存失败时保持选区' })
  await page.evaluate(savedCfi => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    reader.selected_location = { cfi: savedCfi, paragraph_cfi: savedCfi, quote_text: '再次查看同一段落' }
    reader.show_toolbar({ left: 16, top: 100, bottom: 120 }, { x: 0, y: 0 })
  }, selectionInfo.paragraph_cfi)
  await toolbar.getByRole('button', { name: '看本段评论' }).click()
  const drawer = page.locator('.reader-comments-drawer')
  await expect(drawer.getByText('本段评论', { exact: true })).toBeVisible()
  await expect(drawer.getByText('保存失败时保持选区')).toBeVisible()
  // 段尾气泡显示本段公开评论数量，底部「评论」入口回到本章评论。
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('#reader iframe')).map(f => f.contentDocument.querySelector('#passage .comment-count')?.textContent).filter(Boolean))).toEqual(['1'])
  await notesButton(page).click()
  await notesButton(page).click()
  await expect(drawer.getByText('本章评论', { exact: true })).toBeVisible()
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

test('关闭「显示全部划线和评论」不影响评论入口', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  await expect(page.locator('[data-setting=notes_enabled]')).toHaveCount(0)
  const row = page.locator('[data-setting=show_comments]')
  await row.getByRole('switch').uncheck()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.show_comments)).toBe(false)
  await notesButton(page).click()
  await expect(page.locator('.reader-comments-drawer')).toBeVisible()
  await openPanel(page, 'settings')
  await row.getByRole('switch').check()
  await expect.poll(() => readState(page, 'settings').then(settings => settings.show_comments)).toBe(true)
})

// 回归：气泡曾以 inline-block 跟在段尾，末行放不下时会折到新行、把后文往下推；
// 划线标记按绘制时的文字位置画，切换开关后标记先画、气泡后到，标记就留在了原处。
test('段尾气泡不参与正文排版，切换「显示全部划线和评论」后划线标记仍盖在原文上', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
  })
  // 气泡与评论都按当前章节归属，等阅读器定位到本章
  await page.waitForFunction(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.comment_chapter === '未收录的章节')
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const doc = contents.document
    const paragraph = doc.getElementById('passage')
    // 让末行只剩不到一个字的空位：气泡若参与排版就必然折行
    const base = paragraph.textContent
    const lines = () => { const range = doc.createRange(); range.selectNodeContents(paragraph); return range.getClientRects().length }
    const initial = lines()
    let extra = ''
    while (extra.length < 200) {
      paragraph.textContent = base + extra + '字'
      if (lines() > initial && extra) { paragraph.textContent = base + extra; break }
      extra += '字'
    }
    const other = doc.createElement('p')
    other.id = 'other-passage'
    other.textContent = '后一段的正文，划线标记必须始终盖在这几个字上。'
    paragraph.after(other)
    const full = doc.createRange()
    full.selectNodeContents(paragraph.firstChild)
    const highlight = doc.createRange()
    highlight.setStart(other.firstChild, 2)
    highlight.setEnd(other.firstChild, 12)
    window.__highlightCfi = contents.cfiFromRange(highlight)
    const chapter = reader.comment_chapter
    await reader.annotation_repository.save({ client_id: 'bubble-note', annotation_type: 'note', is_private: false, chapter, cfi: reader.paragraph_for_range(full, contents).paragraph_cfi, range_cfi: contents.cfiFromRange(full), quote_text: paragraph.textContent, content: '本段公开评论', color: 'blue' })
    await reader.annotation_repository.save({ client_id: 'bubble-highlight', annotation_type: 'highlight', is_private: true, chapter, cfi: window.__highlightCfi, range_cfi: window.__highlightCfi, quote_text: highlight.toString(), content: '', color: 'yellow' })
  })
  // 划线原文的位置，以及页面上划线标记的位置（主页面坐标）
  const geometry = () => page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const frame = contents.window.frameElement.getBoundingClientRect()
    const text = contents.range(window.__highlightCfi).getClientRects()[0]
    const paragraph = contents.document.getElementById('passage')
    const words = contents.document.createRange()
    words.selectNodeContents(paragraph.firstChild)
    return {
      bubble: !!paragraph.querySelector('.comment-icon'),
      text: { x: Math.round(frame.left + text.left), y: Math.round(frame.top + text.top) },
      marks: Array.from(document.querySelectorAll('.candle-reader-annotation rect')).map(rect => rect.getBoundingClientRect()).map(rect => ({ x: Math.round(rect.left), y: Math.round(rect.top) })),
      lines: Array.from(words.getClientRects()).map(rect => [rect.left, rect.top, rect.right, rect.bottom].map(Math.round)),
    }
  })
  const toggle = value => page.evaluate(value => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    reader.update_settings({ ...reader.settings, show_comments: value })
  }, value)

  await toggle(false)
  await expect.poll(() => geometry().then(g => g.bubble)).toBe(false)
  const withoutBubble = await geometry()
  await toggle(true)
  await expect.poll(() => geometry().then(g => g.bubble)).toBe(true)
  await expect.poll(() => geometry().then(g => g.marks.length)).toBeGreaterThan(0)
  // 标记与气泡都是异步到达，等两者都落定后再比较
  await page.waitForTimeout(300)
  const withBubble = await geometry()
  await captureEvidence(page, 'tb199-bubble-highlight-402x874.png')
  // 气泡插入前后，本段文字的行框完全不变，后一段也不移动
  expect(withBubble.lines).toEqual(withoutBubble.lines)
  expect(withBubble.text).toEqual(withoutBubble.text)
  // 划线标记仍盖在划线原文上
  const { text, marks } = withBubble
  expect(marks.some(mark => Math.abs(mark.x - text.x) <= 1 && Math.abs(mark.y - text.y) <= 1), JSON.stringify(withBubble)).toBe(true)
})

// 段尾常有 <br> 或换行空白：气泡必须紧跟最后一个字、与末行同高，不能掉到下一行；
// 末行写满时可以伸进右侧页边距。有评论的段落不铺底色，只用气泡表示。
test('段尾气泡紧跟最后一个字不换行，评论段落不铺底色', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
  })
  await page.waitForFunction(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.comment_chapter === '未收录的章节')
  await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const doc = contents.document
    const passage = doc.getElementById('passage')
    // 段内换行、段尾还跟着 <br> 和换行空白（与《西游记》诗句段落相同的结构）
    passage.innerHTML = '春采百花为饮食，夏寻诸果作生涯。<br/>秋收芋栗延时节，冬觅黄精度岁华。<br/>\n'
    // 末行恰好写满的段落
    const full = doc.createElement('p')
    full.id = 'full-passage'
    passage.after(full)
    const lines = () => { const range = doc.createRange(); range.selectNodeContents(full); return range.getClientRects().length }
    // 逐字加长，直到再加一个字就会换行：此时末行恰好写满
    let text = ''
    let previous = 0
    for (let i = 0; i < 400; i++) {
      full.textContent = text + '字'
      const count = lines()
      if (previous && count > previous) { full.textContent = text; break }
      previous = count
      text += '字'
    }
    const chapter = reader.comment_chapter
    for (const element of [passage, full]) {
      const range = doc.createRange()
      range.selectNodeContents(element)
      const location = reader.paragraph_for_range(range, contents)
      await reader.annotation_repository.save({ client_id: 'bubble-' + element.id, annotation_type: 'note', is_private: false, chapter, cfi: location.paragraph_cfi, range_cfi: location.paragraph_cfi, quote_text: location.paragraph_quote_text, content: '本段评论', color: 'blue' })
    }
    reader.on_comments_changed()
  })
  const geometry = () => page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const doc = contents.document
    const padding = parseFloat(contents.window.getComputedStyle(doc.body).paddingRight) || 0
    return ['passage', 'full-passage'].map(id => {
      const paragraph = doc.getElementById(id)
      const icon = paragraph.querySelector('.comment-icon')
      if (!icon) return null
      // 最后一个可见字（跳过段尾 <br> 后的空白与气泡本身）
      const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      let last = null
      while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('.comment-icon') && /\S/.test(walker.currentNode.textContent)) last = walker.currentNode
      const end = last.textContent.search(/\s*$/)
      const range = doc.createRange()
      range.setStart(last, end - 1)
      range.setEnd(last, end)
      const rects = range.getClientRects()
      const char = rects[rects.length - 1]
      const box = icon.getBoundingClientRect()
      const fragment = Array.from(paragraph.getClientRects()).find(r => char.left >= r.left - 1 && char.left <= r.right + 1) || paragraph.getBoundingClientRect()
      return { char: [char.left, char.top, char.right, char.bottom], box: [box.left, box.top, box.right, box.bottom], limit: fragment.right + padding }
    })
  })
  await expect.poll(() => geometry().then(items => items.every(Boolean))).toBe(true)
  await page.waitForTimeout(300)
  const items = await geometry()
  await captureEvidence(page, 'tb199-bubble-line-end-402x874.png')
  for (const { char, box, limit } of items) {
    const middle = (box[1] + box[3]) / 2
    // 与最后一个字同一行，紧跟其后
    expect(middle, JSON.stringify(items)).toBeGreaterThanOrEqual(char[1])
    expect(middle, JSON.stringify(items)).toBeLessThanOrEqual(char[3])
    expect(box[0], JSON.stringify(items)).toBeGreaterThanOrEqual(char[2] - 1)
    expect(box[0] - char[2], JSON.stringify(items)).toBeLessThanOrEqual(4)
    // 不超出页边距
    expect(box[2], JSON.stringify(items)).toBeLessThanOrEqual(limit + 1)
  }
  // 写满一行的段落：气泡伸进右侧页边距，而不是压住文字
  expect(items[1].box[0]).toBeGreaterThanOrEqual(items[1].char[2] - 1)
  // 文字评论不在正文铺底色
  expect(await page.locator('.candle-reader-annotation').count()).toBe(0)
  // 调大字号后正文重排，气泡仍跟着最后一个字
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    reader.update_settings({ ...reader.settings, font_size: reader.settings.font_size + 6 })
  })
  await page.waitForTimeout(500)
  const resized = await geometry()
  const { char, box } = resized[0]
  expect((box[1] + box[3]) / 2, JSON.stringify(resized)).toBeGreaterThanOrEqual(char[1])
  expect((box[1] + box[3]) / 2, JSON.stringify(resized)).toBeLessThanOrEqual(char[3])
  expect(box[0], JSON.stringify(resized)).toBeGreaterThanOrEqual(char[2] - 1)
})

test('同段不同选区共享整段评论范围，跨段评论归属最后一段', async ({ page }) => {
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
      const other = contents.document.getElementById('other-passage')
      const range = contents.document.createRange()
      range.setStart(paragraph.firstChild, startOffset)
      range.setEnd(crossParagraph ? other.firstChild : paragraph.querySelector('strong').firstChild, endOffset)
      const selection = contents.document.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      const full = contents.document.createRange()
      full.setStart(paragraph.firstChild, 0)
      full.setEnd(paragraph.lastChild, paragraph.lastChild.length)
      const last = contents.document.createRange()
      last.setStart(other.firstChild, 0)
      last.setEnd(other.firstChild, other.firstChild.length)
      return { cfi: contents.cfiFromRange(range), quote: range.toString(), fullCfi: contents.cfiFromRange(full), fullQuote: paragraph.textContent, lastCfi: contents.cfiFromRange(last) }
    }, { startOffset, endOffset, crossParagraph })
  }
  const first = await select(1, 3)
  const toolbar = page.locator('#comments-toolbar')
  const drawer = page.locator('.reader-comments-drawer')
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '写评论' }).click()
  await expect(page.locator('.annotation-editor-quote')).toHaveText(first.fullQuote)
  await page.getByLabel('评论内容').fill('这个段落的公开评论')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '写评论' })).toBeHidden()
  await expect.poll(() => readState(page, 'annotation_editor_location')).toBe(null)
  const second = await select(2, 5)
  expect(second.cfi).not.toBe(first.cfi)
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '看本段评论' }).click()
  await expect(drawer.getByText('这个段落的公开评论')).toBeVisible()
  await notesButton(page).click()
  await expect(drawer).toBeHidden()

  // 跨段选区可以写评论：归属最后一段，真实选区另存。
  const cross = await select(1, 4, true)
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '写评论' }).click()
  await expect(page.locator('.annotation-editor-quote')).toHaveText(cross.quote)
  await expect(page.getByText('跨段选区 · 评论归属最后一段。')).toBeVisible()
  await page.getByLabel('评论内容').fill('跨两段的评论')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '写评论' })).toBeHidden()
  await expect.poll(() => readState(page, 'annotation_editor_location')).toBe(null)

  // 跨段划线保留精确选区，固定私密，且不改变公开范围偏好。
  await select(1, 4, true)
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '划线', exact: true }).click()
  await expect(toolbar).toBeHidden()
  const saved = await page.evaluate(() => JSON.parse(localStorage['candle-reader:annotations:v1:101']))
  expect(saved).toHaveLength(3)
  expect(saved[0]).toMatchObject({ annotation_type: 'note', cfi: first.fullCfi, quote_text: first.fullQuote, is_private: false })
  expect(saved[1]).toMatchObject({ annotation_type: 'note', cfi: cross.lastCfi, range_cfi: cross.cfi, quote_text: cross.quote, is_private: false })
  expect(saved[2]).toMatchObject({ annotation_type: 'highlight', cfi: cross.cfi, quote_text: cross.quote, is_private: true, content: '' })
  expect(await page.evaluate(() => localStorage.getItem('candle-reader:comment-public'))).toBe('true')
  // 两条公开评论分别归属各自的段落，气泡各计一条。
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#reader iframe')).flatMap(f => ['passage', 'other-passage'].map(id => f.contentDocument.getElementById(id)?.querySelector('.comment-count')?.textContent)).filter(Boolean))).toEqual(['1', '1'])
})

test('快速拖选文字不会被当作点击翻页，工具栏照常出现', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  // 选区放在屏幕右侧三分之一（点击这里原本会翻到下一页）。
  const target = await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const paragraph = contents.document.getElementById('passage')
    paragraph.style.marginLeft = '220px'
    const frame = contents.window.frameElement.getBoundingClientRect()
    const range = contents.document.createRange()
    range.setStart(paragraph.firstChild, 0)
    range.setEnd(paragraph.firstChild, 6)
    const rect = range.getBoundingClientRect()
    return { x: frame.left + rect.left + 2, y: frame.top + rect.top + rect.height / 2, width: rect.width, location: reader.rendition.currentLocation().start.cfi }
  })
  // 等加载遮罩完全淡出，鼠标才落在正文上。
  await expect(page.locator('.v-overlay__scrim')).toHaveCount(0)
  await page.mouse.move(target.x, target.y)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width - 4, target.y, { steps: 3 })
  await page.mouse.up()
  await expect(page.locator('#comments-toolbar')).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.currentLocation().start.cfi)).toBe(target.location)
})

test('已有选中文字时点击别处只取消选中，不翻页', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await expect(page.locator('.v-overlay__scrim')).toHaveCount(0)
  const location = await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const text = contents.document.getElementById('passage').firstChild
    const range = contents.document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 8)
    contents.document.getSelection().addRange(range)
    return reader.rendition.currentLocation().start.cfi
  })
  await expect(page.locator('#comments-toolbar')).toBeVisible()
  // 模拟 iOS：轻点不会先让浏览器清掉选区，直接派发 click 到正文右侧（原本会翻到下一页）。
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const frame = contents.window.frameElement.getBoundingClientRect()
    contents.document.body.dispatchEvent(new contents.window.MouseEvent('click', { bubbles: true, clientX: 380 - frame.left, clientY: 300 - frame.top, detail: 1, view: contents.window }))
  })
  await expect(page.locator('#comments-toolbar')).toBeHidden()
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.getContents().map(c => c.window.getSelection().toString()).join(''))).toBe('')
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.currentLocation().start.cfi)).toBe(location)
})

test('iOS：轻点时选区已被系统清掉，仍只取消选中而不翻页', async ({ page }) => {
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await expect(page.locator('.v-overlay__scrim')).toHaveCount(0)
  const location = await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const text = contents.document.getElementById('passage').firstChild
    const range = contents.document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 8)
    contents.document.getSelection().addRange(range)
    return reader.rendition.currentLocation().start.cfi
  })
  await expect(page.locator('#comments-toolbar')).toBeVisible()
  await expect(page.locator('.selection-preview').first()).toBeVisible()
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    // 模拟 iOS：click 到达之前系统已经清掉了选区。
    contents.window.getSelection().removeAllRanges()
    const frame = contents.window.frameElement.getBoundingClientRect()
    contents.document.body.dispatchEvent(new contents.window.MouseEvent('click', { bubbles: true, clientX: 380 - frame.left, clientY: 300 - frame.top, detail: 1, view: contents.window }))
  })
  await expect(page.locator('#comments-toolbar')).toBeHidden()
  await expect(page.locator('.selection-preview')).toHaveCount(0)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.currentLocation().start.cfi)).toBe(location)
  // 再点一下才是正常翻页。
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const frame = contents.window.frameElement.getBoundingClientRect()
    contents.document.body.dispatchEvent(new contents.window.MouseEvent('click', { bubbles: true, clientX: 380 - frame.left, clientY: 300 - frame.top, detail: 1, view: contents.window }))
  })
  await expect.poll(() => page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.currentLocation().start.cfi)).not.toBe(location)
})

test('关闭选中工具栏时不画阅读器自己的选区底色，点别处只取消选中', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('readerSettings', JSON.stringify({ show_selection_toolbar: false })))
  await page.goto(`${HARNESS_URL}?missing_toc=1`)
  await waitForReaderRendered(page)
  await expect(page.locator('.v-overlay__scrim')).toHaveCount(0)
  const location = await page.evaluate(async () => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    await reader.rendition.display('chapter.xhtml')
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    const text = contents.document.getElementById('passage').firstChild
    const range = contents.document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 8)
    contents.document.getSelection().addRange(range)
    return reader.rendition.currentLocation().start.cfi
  })
  await expect.poll(() => readState(page, 'selection_active')).toBe(true)
  await expect(page.locator('#comments-toolbar')).toBeHidden()
  await expect(page.locator('.selection-preview')).toHaveCount(0)
  await page.evaluate(() => {
    const reader = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const contents = reader.rendition.getContents().find(item => reader.book.spine.get(item.sectionIndex).href === 'chapter.xhtml')
    contents.window.getSelection().removeAllRanges()
    const frame = contents.window.frameElement.getBoundingClientRect()
    contents.document.body.dispatchEvent(new contents.window.MouseEvent('click', { bubbles: true, clientX: 380 - frame.left, clientY: 300 - frame.top, detail: 1, view: contents.window }))
  })
  await expect.poll(() => readState(page, 'selection_active')).toBe(false)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.rendition.currentLocation().start.cfi)).toBe(location)
})
