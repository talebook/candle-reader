// 登录 / 用户中心相关流程，后端全部 mock。
const { test, expect } = require('@playwright/test')
const { setupApiMock, SAMPLE_USER } = require('./helpers/mock-api')
const { gotoReader, readState } = require('./helpers/reader')

test('未登录时「用户」面板展示登录表单', async ({ page }) => {
  await setupApiMock(page) // 游客态：/api/user/info 返回未登录
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.getByText('登录到书评系统')).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
})

test('/api/review/me 返回 need_login 时 is_login 置为 false', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await expect.poll(() => readState(page, 'is_login')).toBe(false)
})

test('输入邮箱密码登录成功后展示用户中心', async ({ page }) => {
  await setupApiMock(page, {
    'POST /api/user/sign_in': { err: 'ok', data: SAMPLE_USER },
  })
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await page.getByLabel('邮箱').fill(SAMPLE_USER.email)
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录', exact: true }).click()

  // 登录成功后 Guest 被 UserCenter 取代
  await expect(page.getByText('退出登录')).toBeVisible()
  await expect.poll(() => readState(page, 'user')).not.toBeNull()
})

test('登录失败时展示错误提示且不进入用户中心', async ({ page }) => {
  await setupApiMock(page, {
    'POST /api/user/sign_in': { err: 'auth.failed', msg: '邮箱或密码错误' },
  })
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await page.getByLabel('邮箱').fill('wrong@example.com')
  await page.getByLabel('密码').fill('bad')
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page.getByText('邮箱或密码错误')).toBeVisible()
  await expect(page.getByText('退出登录')).toBeHidden()
})

test('忘记密码：重置成功展示提示', async ({ page }) => {
  await setupApiMock(page, {
    'POST /api/user/reset': { err: 'ok' },
  })
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await page.getByRole('button', { name: '忘记密码?' }).click()
  await page.getByLabel('邮箱').fill('reset@example.com')
  await page.getByRole('button', { name: '重置密码' }).click()
  await expect(page.getByText('重置成功！请查阅密码通知邮件。')).toBeVisible()
})

test('快速注册：注册成功展示提示并回到登录', async ({ page }) => {
  await setupApiMock(page, {
    'POST /api/user/sign_up': { err: 'ok' },
  })
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await page.getByRole('button', { name: '快速注册' }).click()
  await page.getByLabel('邮箱').fill('newbie@example.com')
  await page.getByLabel('昵称').fill('新书友')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('注册成功！请查阅密码通知邮件。')).toBeVisible()
})

test('启动时已登录则「用户」面板直接展示用户中心', async ({ page }) => {
  await setupApiMock(page, {
    'GET /api/user/info': { err: 'ok', data: SAMPLE_USER },
    'GET /api/review/me': { err: 'ok', data: { count: 3 } },
  })
  await gotoReader(page)

  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.getByText('退出登录')).toBeVisible()
  await expect(page.getByText('登录到书评系统')).toBeHidden()
})
