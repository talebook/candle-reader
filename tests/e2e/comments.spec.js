// 章评/段评面板：评论列表展示与发表（已登录态）。
const { test, expect } = require('@playwright/test')
const { setupApiMock, SAMPLE_COMMENTS } = require('./helpers/mock-api')
const { gotoReader, openCommentsPanel, readState } = require('./helpers/reader')

// 已登录态：review/me 返回 ok，使 is_login 保持 true（评论区显示输入框而非登录按钮）
const LOGGED_IN = { 'GET /api/review/me': { err: 'ok', data: { count: 0 } } }

test('已登录时评论面板展示输入框与发表按钮', async ({ page }) => {
  await setupApiMock(page, LOGGED_IN)
  await gotoReader(page)
  await openCommentsPanel(page)

  await expect(page.getByPlaceholder('爱书之人，维持良好的社区氛围')).toBeVisible()
  await expect(page.getByRole('button', { name: '发表' })).toBeVisible()
  await expect(page.getByRole('button', { name: '点击登录，发表评论' })).toBeHidden()
})

test('评论列表渲染后端返回的评论', async ({ page }) => {
  await setupApiMock(page, {
    ...LOGGED_IN,
    'GET /api/review/list': { err: 'ok', data: { list: SAMPLE_COMMENTS } },
  })
  await gotoReader(page)
  await openCommentsPanel(page)

  await expect(page.getByText('这一段写得真好')).toBeVisible()
  await expect(page.getByText('深有同感')).toBeVisible()
})

test('发表评论成功后追加到列表', async ({ page }) => {
  const newComment = { id: 99, content: '写得很好', nickName: '测试书友', avatar: 'mdi-account', level: 3, createTime: '2026-06-02', geo: '杭州', likeCount: 0 }
  await setupApiMock(page, {
    ...LOGGED_IN,
    'GET /api/review/list': { err: 'ok', data: { list: [] } },
    'POST /api/review/add': { err: 'ok', data: newComment },
  })
  // on_add_review 成功后会 alert('评论成功')，自动接受弹窗
  page.on('dialog', (d) => d.accept())

  await gotoReader(page)
  await openCommentsPanel(page)

  await page.getByPlaceholder('爱书之人，维持良好的社区氛围').fill('写得很好')
  await page.getByRole('button', { name: '发表' }).click()

  await expect.poll(() => readState(page, 'comments').then(c => c.length)).toBe(1)
  await expect(page.getByText('写得很好')).toBeVisible()
})
