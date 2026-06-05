// 用户中心：登出、改昵称、未读消息红点。均以“已登录”态启动。
const { test, expect } = require('@playwright/test')
const { setupApiMock, SAMPLE_USER } = require('./helpers/mock-api')
const { gotoReader, readState } = require('./helpers/reader')

// 已登录态：user/info 返回用户，review/me 返回 ok
function loggedIn(extra = {}) {
  return {
    'GET /api/user/info': { err: 'ok', data: SAMPLE_USER },
    'GET /api/review/me': { err: 'ok', data: { count: 0 } },
    ...extra,
  }
}

test('退出登录：确认后回到游客登录表单', async ({ page }) => {
  await setupApiMock(page, loggedIn({ 'GET /api/user/sign_out': { err: 'ok' } }))
  await gotoReader(page)

  await page.getByRole('button', { name: '评论' }).click()
  await page.getByText(SAMPLE_USER.nickname).click()
  await page.getByText('退出登录').click()
  // 弹出确认框
  await expect(page.getByText('是否要退出登录？')).toBeVisible()
  await page.getByRole('button', { name: '确认' }).click()

  // 登出后 user 置空，用户中心关闭，本书评论面板回到游客态（展示「点击登录」入口）
  await expect.poll(() => readState(page, 'user')).toBeNull()
  await expect(page.locator('.book-review-card').getByRole('button', { name: '点击登录，发表评论' })).toBeVisible()
})

test('退出登录：失败时停留并提示错误', async ({ page }) => {
  await setupApiMock(page, loggedIn({
    'GET /api/user/sign_out': { err: 'exception', msg: '服务异常' },
  }))
  await gotoReader(page)

  await page.getByRole('button', { name: '评论' }).click()
  await page.getByText(SAMPLE_USER.nickname).click()
  await page.getByText('退出登录').click()
  await page.getByRole('button', { name: '确认' }).click()

  await expect(page.getByText('服务异常')).toBeVisible()
  await expect.poll(() => readState(page, 'user')).not.toBeNull()
})

test('修改昵称：保存成功后关闭对话框', async ({ page }) => {
  await setupApiMock(page, loggedIn({
    'POST /api/user/update': { err: 'ok', data: { ...SAMPLE_USER, nickname: '新昵称' } },
  }))
  await gotoReader(page)

  await page.getByRole('button', { name: '评论' }).click()
  await page.getByText(SAMPLE_USER.nickname).click()
  await page.getByText('昵称').click()
  await expect(page.getByText('修改昵称')).toBeVisible()
  await page.getByLabel('新昵称').fill('新昵称')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('修改昵称')).toBeHidden()
})

test('修改昵称：失败时对话框保留并提示', async ({ page }) => {
  await setupApiMock(page, loggedIn({
    'POST /api/user/update': { err: 'exception', msg: '昵称已被占用' },
  }))
  await gotoReader(page)

  await page.getByRole('button', { name: '评论' }).click()
  await page.getByText(SAMPLE_USER.nickname).click()
  await page.getByText('昵称').click()
  await page.getByLabel('新昵称').fill('重复昵称')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('昵称已被占用')).toBeVisible()
  await expect(page.getByText('修改昵称')).toBeVisible()
})

test('有未读消息时「用户」按钮显示红点角标', async ({ page }) => {
  await setupApiMock(page, loggedIn({ 'GET /api/review/me': { err: 'ok', data: { count: 3 } } }))
  await gotoReader(page)
  await expect.poll(() => readState(page, 'unread_count')).toBe(3)
  await expect(page.locator('.v-badge__badge').filter({ hasText: '3' })).toBeVisible()
})
