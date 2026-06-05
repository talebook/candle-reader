// 回归测试：段评/章评面板里的「点击登录，发表评论」。
// 历史 bug：BookComments 直接对只读 prop `login` 赋值（@click="login = !login"），
// 触发 Vue 警告 "Set operation on key \"login\" failed: target is readonly"，
// 点击登录无任何反应。修复后改为 $emit('login')，父组件 set_menu('more') 打开登录面板。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel } = require('./helpers/reader')

test.describe('章评面板登录入口', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMock(page) // 游客态：评论区显示「点击登录」按钮
  })

  test('未登录时评论面板展示「点击登录」按钮', async ({ page }) => {
    await gotoReader(page)
    await openPanel(page, 'comments')
    await expect(page.getByText('评论列表')).toBeVisible()
    await expect(page.getByRole('button', { name: '点击登录，发表评论' })).toBeVisible()
  })

  test('点击「点击登录」切换到登录面板，且无 readonly 警告', async ({ page }) => {
    // 捕获控制台警告，用于断言不再出现 readonly 报错
    const warnings = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        warnings.push(msg.text())
      }
    })

    await gotoReader(page)
    await openPanel(page, 'comments')

    // 章评面板「点击登录」→ set_menu('more') 切到本书评论面板
    await page.getByRole('button', { name: '点击登录，发表评论' }).click()
    await expect(page.getByText('本书评论')).toBeVisible()

    // 本书评论面板「点击登录」→ 弹出登录对话框（限定在本书评论卡片内，避开收起中的章评面板同名按钮）
    await page.locator('.book-review-card').getByRole('button', { name: '点击登录，发表评论' }).click()
    await expect(page.getByText('登录到书评系统')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()

    // 关键断言：不再有“对只读对象赋值”的 Vue 警告
    const readonlyWarn = warnings.find((w) => /readonly/i.test(w) && /login/i.test(w))
    expect(readonlyWarn, `不应出现 readonly 警告，实际捕获:\n${warnings.join('\n')}`).toBeUndefined()
  })
})
