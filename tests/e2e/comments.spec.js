// 统一评论：抽屉、完整评论页、评论详情页，以及赞、踩、回复、修改、删除。
// 数据全部来自内存版宿主（annotation_callbacks），阅读器不直接请求任何后端。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoHostReader } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 } })

const nav = page => page.locator('.v-bottom-navigation').getByRole('button', { name: '评论' })
const drawer = page => page.locator('.reader-comments-drawer')
const fullPage = page => page.getByRole('dialog', { name: '完整评论页' })
const detail = page => page.getByRole('dialog', { name: '评论详情' })
const item = (scope, id) => scope.locator(`[data-comment="${id}"]`)
const hostCalls = (page, operation) => page.evaluate(op => window.__host.calls.filter(call => call.operation === op), operation)

let api
test.beforeEach(async ({ page }) => {
  api = await setupApiMock(page)
})

test('评论抽屉默认展示本章公开评论，自己的在前，阅读器不直接请求评论或账号接口', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await expect(drawer(page).getByText('本章评论', { exact: true })).toBeVisible()
  const items = drawer(page).locator('.comment-item')
  await expect(items).toHaveCount(3)
  await expect(items.first()).toHaveAttribute('data-mine', 'true')
  // 私密记录、整书评论和别的章节不进入本章评论。
  for (const id of [3, 5, 6, 7]) await expect(item(drawer(page), id)).toHaveCount(0)
  // 别人的评论没有修改和删除入口。
  await expect(item(drawer(page), 1).getByRole('button', { name: '修改' })).toHaveCount(0)
  await expect(item(drawer(page), 2).getByRole('button', { name: '修改' })).toBeVisible()
  // 抽屉展开时底部菜单仍可见可点，占菜单上方区域的 90%。
  const menu = await page.locator('.v-bottom-navigation').boundingBox()
  const sheet = () => page.locator('.annotation-bottom-sheet .v-overlay__content').boundingBox()
  await expect.poll(async () => Math.round((await sheet()).y)).toBe(Math.round(menu.y * 0.1))
  expect(Math.round((await sheet()).height)).toBe(Math.round(menu.y * 0.9))
  await expect(drawer(page).getByPlaceholder(/搜索/)).toHaveCount(0)
  expect(api.calls.filter(call => /\/api\/(review|user)\//.test(call.url))).toEqual([])
  await nav(page).click()
  await expect(drawer(page)).toBeHidden()
})

test('滚动到底自动加载下一页，切换范围重置分页且迟到响应不混入', async ({ page }) => {
  await gotoHostReader(page, '&extra=45')
  await nav(page).click()
  const items = drawer(page).locator('.comment-item')
  await expect(items).toHaveCount(20)
  await expect(drawer(page).getByText('继续下滑，加载更多评论')).toBeVisible()
  await drawer(page).locator('.comment-list').evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect(items).toHaveCount(40)
  await drawer(page).locator('.comment-list').evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect(items).toHaveCount(48)
  await expect(drawer(page).getByText('已显示全部评论')).toBeVisible()
  expect((await hostCalls(page, 'list')).map(call => call.query.cursor)).toEqual([null, '20', '40'])

  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  const pageItems = fullPage(page).locator('.comment-item')
  await expect(pageItems).toHaveCount(20)
  // 本章的下一页还在路上时切到「我的」：迟到的本章数据不能混进来。
  await page.evaluate(() => window.__host.hold('list'))
  await fullPage(page).locator('.comment-list').evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect.poll(async () => (await hostCalls(page, 'list')).length).toBe(5)
  await page.evaluate(() => { window.__host.release('list') ; window.__host.hold('list') })
  await fullPage(page).getByRole('button', { name: '我的' }).click()
  await page.evaluate(() => window.__host.release('list'))
  await expect(pageItems).toHaveCount(3)
  await expect(fullPage(page).locator('.comment-item[data-mine="false"]')).toHaveCount(0)
})

test('完整评论页独立占满区域，「我的」含私密记录，返回后恢复抽屉', async ({ page }) => {
  await gotoHostReader(page, '&extra=30')
  await nav(page).click()
  await expect(drawer(page).locator('.comment-item')).toHaveCount(20)
  await drawer(page).locator('.comment-list').evaluate(el => { el.scrollTop = 300 })
  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  await expect(fullPage(page)).toBeVisible()
  await expect.poll(async () => Object.values(await fullPage(page).locator('.rc-page').boundingBox())).toEqual([0, 0, 402, 874])
  // 独立页面盖住阅读菜单。
  expect(await page.evaluate(() => document.elementFromPoint(200, 860).closest('.v-bottom-navigation'))).toBe(null)
  await expect(fullPage(page).locator('.rc-tab')).toHaveText(['本章评论', '全书评论', '我的'])

  await fullPage(page).getByRole('button', { name: '全书评论' }).click()
  await expect(item(fullPage(page), 6)).toBeVisible()
  await expect(item(fullPage(page), 7)).toBeVisible()
  await expect(item(fullPage(page), 5)).toHaveCount(0)

  await fullPage(page).getByRole('button', { name: '我的' }).click()
  await expect(fullPage(page).locator('.comment-item')).toHaveCount(3)
  await expect(item(fullPage(page), 3).locator('.comment-tag')).toHaveText(['划线', '私密'])
  await expect(item(fullPage(page), 3).getByRole('button', { name: '修改' })).toHaveCount(0)
  // 私密记录没有赞踩和回复入口。
  await expect(item(fullPage(page), 5).locator('.comment-vote')).toHaveCount(0)
  await expect(item(fullPage(page), 5).getByRole('button', { name: '1 条回复 · 仅你可见' })).toBeVisible()

  // 浏览器返回回到抽屉：范围、已加载数量与滚动位置保持不变。
  await page.goBack()
  await expect(fullPage(page)).toBeHidden()
  await expect(drawer(page).locator('.comment-item')).toHaveCount(20)
  expect(await drawer(page).locator('.comment-list').evaluate(el => el.scrollTop)).toBe(300)
  await expect(drawer(page).getByRole('button', { name: /查看更多评论/ })).toBeFocused()
})

test('赞踩互斥可取消，失败时恢复原状', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  const like = item(drawer(page), 1).getByRole('button', { name: /^赞/ })
  const dislike = item(drawer(page), 1).getByRole('button', { name: /^踩/ })
  await expect(like).toHaveAccessibleName('赞 12')
  await like.click()
  await expect(like).toHaveAccessibleName('赞 13')
  await expect(like).toHaveAttribute('aria-pressed', 'true')
  await dislike.click()
  await expect(like).toHaveAccessibleName('赞 12')
  await expect(dislike).toHaveAccessibleName('踩 2')
  await dislike.click()
  await expect(dislike).toHaveAccessibleName('踩 1')
  await expect(dislike).toHaveAttribute('aria-pressed', 'false')
  expect((await hostCalls(page, 'vote')).map(call => call.query.value)).toEqual([1, -1, 0])
  // 允许给自己的评论投票。
  await item(drawer(page), 2).getByRole('button', { name: /^赞/ }).click()
  await expect(item(drawer(page), 2).getByRole('button', { name: /^赞/ })).toHaveAccessibleName('赞 5')
  // 点赞踩不进入详情页。
  await expect(detail(page)).toBeHidden()

  await page.evaluate(() => window.__host.fail('vote', '模拟投票失败'))
  await like.click()
  await expect(page.getByText('操作失败：模拟投票失败')).toBeVisible()
  await expect(like).toHaveAccessibleName('赞 12')
  await expect(like).toHaveAttribute('aria-pressed', 'false')
})

test('点击单条评论进入详情页：第一层回复不缩进，之后统一缩进一级，可回复、修改、删除', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await item(drawer(page), 1).locator('.comment-content').click()
  await expect(detail(page)).toBeVisible()
  // 列表内不展开回复。
  await expect(drawer(page).locator('[data-comment="901"]')).toHaveCount(0)
  const left = async id => (await item(detail(page), id).locator('.comment-content').boundingBox()).x
  await expect.poll(() => left(1)).toBe(20)
  expect(await left(901)).toBe(await left(1))
  expect(await left(902)).toBeGreaterThan(await left(901) + 16)
  expect(await left(903)).toBe(await left(902))
  await expect(item(detail(page), 902).locator('.comment-content')).toContainText('回复 小舟：')
  await expect(item(detail(page), 901).getByRole('button', { name: '删除' })).toHaveCount(0)

  // 回复第二层回复：仍在同一组内，不再加深。
  const input = detail(page).getByLabel('回复内容')
  await item(detail(page), 903).getByRole('button', { name: '回复', exact: true }).click()
  await expect(input).toHaveAttribute('placeholder', '回复 林间')
  await input.fill('第三遍了')
  await detail(page).getByRole('button', { name: '发送' }).click()
  const third = detail(page).locator('.comment-item', { hasText: '第三遍了' })
  await expect(third).toContainText('回复 林间：')
  expect((await third.locator('.comment-content').boundingBox()).x).toBe(await left(902))
  await expect(item(detail(page), 1).getByRole('button', { name: '回复 4' })).toBeVisible()

  // 回复主评论：新的第一层回复，不缩进。
  await item(detail(page), 1).getByRole('button', { name: '回复 4' }).click()
  await expect(input).toHaveAttribute('placeholder', '回复 林间')
  await input.fill('直接回主评论')
  await detail(page).getByRole('button', { name: '发送' }).click()
  const first = detail(page).locator('.comment-item', { hasText: '直接回主评论' })
  expect((await first.locator('.comment-content').boundingBox()).x).toBe(await left(1))

  // 修改自己的回复，不显示「已编辑」。
  await item(detail(page), 902).getByRole('button', { name: '修改' }).click()
  await expect(input).toHaveValue('所以这一段我读了两遍。')
  await input.fill('这一段我读了三遍。')
  await detail(page).getByRole('button', { name: '保存' }).click()
  await expect(item(detail(page), 902)).toContainText('这一段我读了三遍。')
  await expect(item(detail(page), 902)).not.toContainText('已编辑')

  // 删除自己的第一层回复：其下回复一并删除。
  await first.getByRole('button', { name: '回复', exact: true }).click()
  await input.fill('自己接一句')
  await detail(page).getByRole('button', { name: '发送' }).click()
  await expect(item(detail(page), 1).getByRole('button', { name: '回复 6' })).toBeVisible()
  await first.getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('这条回复下的 1 条回复也会一并删除。确定删除吗？')).toBeVisible()
  await page.getByRole('button', { name: '删除', exact: true }).last().click()
  await expect(detail(page).locator('.comment-item', { hasText: '自己接一句' })).toHaveCount(0)
  await expect(item(detail(page), 1).getByRole('button', { name: '回复 4' })).toBeVisible()

  // 返回后列表里的回复数同步，焦点回到进入时的条目。
  await detail(page).getByRole('button', { name: '返回评论列表' }).click()
  await expect(detail(page)).toBeHidden()
  await expect(item(drawer(page), 1).getByRole('button', { name: '回复 4' })).toBeFocused()
})

test('在详情页删除主评论：连同回复删除并回到列表', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await item(drawer(page), 2).getByRole('button', { name: '回复 0' }).click()
  await expect(detail(page)).toBeVisible()
  await detail(page).getByLabel('回复内容').fill('先回一条')
  await detail(page).getByRole('button', { name: '发送' }).click()
  await item(detail(page), 2).getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('这条评论下的 1 条回复也会一并删除。确定删除吗？')).toBeVisible()
  await page.getByRole('button', { name: '删除', exact: true }).last().click()
  await expect(detail(page)).toBeHidden()
  await expect(item(drawer(page), 2)).toHaveCount(0)
  expect(await page.evaluate(() => window.__host.records.filter(record => record.id === 2 || record.root_id === 2).length)).toBe(0)
})

test('私密记录的详情只读，回复仅作者可见', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  await fullPage(page).getByRole('button', { name: '我的' }).click()
  await item(fullPage(page), 5).getByRole('button', { name: '1 条回复 · 仅你可见' }).click()
  await expect(detail(page).getByText('1 条回复 · 仅你可见')).toBeVisible()
  await expect(item(detail(page), 904)).toBeVisible()
  await expect(detail(page).locator('.comment-vote')).toHaveCount(0)
  await expect(detail(page).getByLabel('回复内容')).toHaveCount(0)
  // Esc 只退出详情页，仍停在完整页「我的」。
  await page.keyboard.press('Escape')
  await expect(detail(page)).toBeHidden()
  await expect(fullPage(page).getByRole('button', { name: '我的' })).toHaveAttribute('aria-pressed', 'true')
})

test('修改评论并改为私密后，只在「我的」中出现', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await item(drawer(page), 2).getByRole('button', { name: '修改' }).click()
  const editor = page.getByRole('dialog', { name: '编辑评论' })
  await expect(editor.getByLabel('评论内容')).toHaveValue('读到这里想到上周的散步。')
  await editor.getByLabel('评论内容').fill('改过的内容')
  await editor.getByRole('switch', { name: '公开这条评论' }).uncheck()
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(item(drawer(page), 2)).toHaveCount(0)
  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  await fullPage(page).getByRole('button', { name: '我的' }).click()
  await expect(item(fullPage(page), 2)).toContainText('改过的内容')
  await expect(item(fullPage(page), 2)).not.toContainText('已编辑')
  // 编辑已有记录不改变「新建时默认公开范围」的偏好。
  expect(await page.evaluate(() => localStorage.getItem('candle-reader:comment-public'))).toBe(null)
})

test('写整书评论：只出现在全书评论，公开范围偏好被记住', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  await drawer(page).getByRole('button', { name: '写评论' }).click()
  const editor = page.getByRole('dialog', { name: '写整书评论' })
  await expect(editor.getByRole('switch', { name: '公开这条评论' })).toBeChecked()
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor.getByText('请填写评论内容')).toBeVisible()
  await editor.getByLabel('评论内容').fill('整本书都很好看')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('评论已保存，可在「全书评论」中查看')).toBeVisible()
  await expect(drawer(page).getByText('整本书都很好看')).toHaveCount(0)
  const saved = (await hostCalls(page, 'save')).pop().query
  expect(saved).toMatchObject({ annotation_type: 'book_comment', is_private: false, content: '整本书都很好看' })
  expect(saved.cfi).toMatch(/^epubcfi\(.+!\/4\)$/)
  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  await fullPage(page).getByRole('button', { name: '全书评论' }).click()
  await expect(fullPage(page).getByText('整本书都很好看')).toBeVisible()

  // 改成私密保存后，下次新建沿用私密；刷新后仍保留。
  await fullPage(page).getByRole('button', { name: '写评论' }).click()
  await editor.getByRole('switch', { name: '公开这条评论' }).uncheck()
  await editor.getByLabel('评论内容').fill('只给自己看')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已保存为私密，可在「查看更多评论 › 我的」中查看')).toBeVisible()
  await expect(fullPage(page).getByText('只给自己看')).toHaveCount(0)
  await page.reload()
  await nav(page).click()
  await drawer(page).getByRole('button', { name: '写评论' }).click()
  await expect(editor.getByRole('switch', { name: '公开这条评论' })).not.toBeChecked()
})

test('游客可以浏览，互动与「我的」引导登录', async ({ page }) => {
  await gotoHostReader(page, '&guest=1')
  await nav(page).click()
  await expect(drawer(page).locator('.comment-item')).toHaveCount(3)
  await expect(drawer(page).locator('.comment-item[data-mine="true"]')).toHaveCount(0)
  await item(drawer(page), 1).getByRole('button', { name: /^赞/ }).click()
  await expect(page.getByText('请先登录后再操作')).toBeVisible()
  await expect(item(drawer(page), 1).getByRole('button', { name: /^赞/ })).toHaveAccessibleName('赞 12')
  expect(await hostCalls(page, 'vote')).toEqual([])
  expect((await hostCalls(page, 'login')).length).toBe(1)
  await drawer(page).getByRole('button', { name: '写评论' }).click()
  await expect(page.getByRole('dialog', { name: '写整书评论' })).toHaveCount(0)
  await drawer(page).getByRole('button', { name: /查看更多评论/ }).click()
  await fullPage(page).getByRole('button', { name: '我的' }).click()
  await expect(fullPage(page).getByText('登录后查看你的划线和评论')).toBeVisible()
  // 游客可以进入详情查看回复，但不能回复。
  await fullPage(page).getByRole('button', { name: '本章评论' }).click()
  await item(fullPage(page), 1).locator('.comment-content').click()
  await expect(item(detail(page), 901)).toBeVisible()
  await detail(page).getByLabel('回复内容').fill('游客回复')
  await detail(page).getByRole('button', { name: '发送' }).click()
  expect(await hostCalls(page, 'save')).toEqual([])
})

test('加载失败可重试，空范围有空状态', async ({ page }) => {
  await gotoHostReader(page)
  await page.evaluate(() => window.__host.fail('list', '模拟读取失败'))
  await nav(page).click()
  await expect(drawer(page).getByRole('alert')).toContainText('模拟读取失败')
  await expect(drawer(page).getByText('这里还没有公开评论')).toHaveCount(0)
  await page.evaluate(() => window.__host.fail('list'))
  await drawer(page).getByRole('button', { name: '重新加载' }).click()
  await expect(drawer(page).locator('.comment-item')).toHaveCount(3)
  await page.evaluate(() => { window.__host.records.length = 0 })
  await nav(page).click()
  await nav(page).click()
  await expect(drawer(page).getByText('这里还没有公开评论')).toBeVisible()
})

test('桌面端评论是右侧覆盖式侧边栏，目录在左侧，底部菜单保持可用', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await gotoHostReader(page)
  const reader = await page.locator('#reader').boundingBox()
  await nav(page).click()
  const menu = await page.locator('.v-bottom-navigation').boundingBox()
  // 避开顶部栏与底部菜单，贴右侧。
  await expect.poll(async () => Object.values(await page.locator('.annotation-bottom-sheet .v-overlay__content').boundingBox())).toEqual([860, 48, 420, menu.y - 48])
  expect((await page.locator('#reader').boundingBox()).width).toBe(reader.width)
  await page.locator('.v-bottom-navigation').getByRole('button', { name: '目录' }).click()
  await expect(drawer(page)).toBeHidden()
  await expect.poll(async () => { const toc = await page.locator('.reader-side-left .v-overlay__content').boundingBox(); return [toc.x, toc.y, toc.width] }).toEqual([0, 48, 300])
})

test('宿主要求登录才能看评论时，游客看到登录提示，登录后自动加载', async ({ page }) => {
  await gotoHostReader(page, '&guest=1&locked=1')
  await nav(page).click()
  await expect(drawer(page).getByText('登录后查看评论')).toBeVisible()
  await expect(drawer(page).getByRole('alert')).toHaveCount(0)
  // 模拟宿主的登录流程：login 回调里完成登录。
  await page.evaluate(() => {
    const host = window.__host
    const original = host.callbacks.login
    host.callbacks.login = async (...args) => { await original(...args); host.setUser(true) }
  })
  await drawer(page).getByRole('button', { name: '去登录' }).click()
  await expect(drawer(page).locator('.comment-item')).toHaveCount(3)
})

test('评论区强调色文字在各主题下与底色对比度不低于 4.5:1', async ({ page }) => {
  await gotoHostReader(page)
  await nav(page).click()
  const more = drawer(page).getByRole('button', { name: /查看更多评论/ })
  await expect(more).toBeVisible()
  for (const theme of ['white', 'eyecare', 'grey', 'dark', 'zhulin', 'parchment', 'huitu', 'xingye']) {
    await page.evaluate(theme => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      r.update_settings({ ...r.settings, theme })
    }, theme)
    await expect.poll(() => more.evaluate(el => {
      // color-mix 的计算值是 color(srgb r g b)，分量为 0–1；rgb() 分量为 0–255。
      const parse = c => {
        const m = c.match(/[\d.]+/g).map(Number)
        return { rgb: c.startsWith('color(') ? m.slice(0, 3).map(v => v * 255) : m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }
      }
      const layers = []
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor)
        if (c.a > 0) { layers.unshift(c); if (c.a >= 1) break }
      }
      const bg = layers.reduce((rgb, l) => rgb.map((v, i) => v * (1 - l.a) + l.rgb[i] * l.a), [255, 255, 255])
      const fg = parse(getComputedStyle(el).color)
      const lum = rgb => rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
      const [a, b] = [lum(fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a))), lum(bg)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }), `${theme} 主题下「查看更多评论」对比度不足`).toBeGreaterThanOrEqual(4.5)
  }
})

test('一页横跨两章时，页尾那一章的段落评论也显示气泡，点开按段落所在章节列出', async ({ page }) => {
  // 西游记一个正文文件里有好几回；从第三回开头那段所在的页开始读，这一页从第二回末尾跨进第三回。
  await gotoHostReader(page, '&book=xi-you-ji.epub&at=' + encodeURIComponent('5039418960600707614_23962-0-0.txt.xhtml#chapter-003'))
  const target = '那厢乃傲来国界'
  const layout = await page.evaluate(async target => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    const find = () => {
      for (const c of r.rendition.getContents()) {
        const p = [...c.document.querySelectorAll('p')].find(p => p.textContent.includes(target))
        if (p) return { c, p }
      }
    }
    const { c, p } = find()
    await r.rendition.display(c.cfiFromNode(p))
    await new Promise(resolve => setTimeout(resolve, 1500))
    return { start: r.current_toc.label }
  }, target)
  expect(layout.start, '前置条件：页首仍在第二回').toContain('第二回')

  // 在第三回的这段选几个字，写一条公开评论。
  await page.evaluate(async target => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    for (const c of r.rendition.getContents()) {
      const p = [...c.document.querySelectorAll('p')].find(p => p.textContent.includes(target))
      if (!p) continue
      const walker = c.document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode()) && node.textContent.trim().length < 5);
      const range = c.document.createRange()
      range.setStart(node, 0)
      range.setEnd(node, 4)
      r.rendition.emit('selected', c.cfiFromRange(range), c)
    }
    r.open_note_editor()
    r.annotation_editor_content = '跨章页面的段落评论'
    r.annotation_editor_private = false
    await r.save_note()
  }, target)
  const saved = (await hostCalls(page, 'save')).at(-1)
  expect(saved.query.chapter).toContain('第三回')

  // 保存后气泡立刻出现在这段末尾，不用翻页。
  const bubble = () => page.evaluate(target => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    for (const c of r.rendition.getContents()) {
      const p = [...c.document.querySelectorAll('p')].find(p => p.textContent.includes(target))
      const icon = p && p.querySelector('.comment-icon')
      if (icon) return icon.textContent.trim()
    }
    return null
  }, target)
  await expect.poll(bubble).toBe('1')

  // 点气泡：本段评论按第三回查询，列出刚写的评论。
  await page.evaluate(target => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    for (const c of r.rendition.getContents()) {
      const p = [...c.document.querySelectorAll('p')].find(p => p.textContent.includes(target))
      p?.querySelector('.comment-icon')?.click()
    }
  }, target)
  await expect(drawer(page).getByText('跨章页面的段落评论')).toBeVisible()
  const query = (await hostCalls(page, 'list')).at(-1).query
  expect(query.scope).toBe('paragraph')
  expect(query.chapter).toContain('第三回')
})
