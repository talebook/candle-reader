const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoHostReader } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

for (const theme of ['white', 'grey']) {
  test(`面板最终关闭恢复入口，切换不抢焦 ${theme}`, async ({ page }) => {
    await setupApiMock(page)
    await page.addInitScript(theme => localStorage.setItem('readerSettings', JSON.stringify({ theme })), theme)
    await gotoHostReader(page)
    const comments = page.locator('.v-bottom-navigation').getByRole('button', { name: '评论' })
    const settings = page.locator('.v-bottom-navigation').getByRole('button', { name: '设置' })
    const drawer = page.locator('.reader-comments-drawer')
    const fullPage = page.getByRole('dialog', { name: '完整评论页' })
    const detail = page.getByRole('dialog', { name: '评论详情' })
    async function enter(button) { await button.focus(); await page.keyboard.press('Enter') }
    // 等焦点进入抽屉后再继续，避免在展开动画的同一帧里按键。
    async function settled() {
      await expect(drawer).toBeVisible()
      await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('.annotation-bottom-sheet'))).toBe(true)
    }
    async function open() { await enter(comments); await settled() }

    // Esc 与点击抽屉外区域收起后，焦点回到底部「评论」入口。
    await open()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(comments).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(settings).toBeFocused()
    await open()
    await page.locator('.annotation-bottom-sheet .v-overlay__scrim').click({ position: { x: 10, y: 60 } }) // 顶部栏下方、抽屉上方的外部区域
    await expect(drawer).toBeHidden()
    await expect(comments).toBeFocused()

    // 独立页面逐层返回：详情页 → 完整页 → 抽屉，Esc 每次只退一层，最后回到入口。
    await open()
    await enter(drawer.getByRole('button', { name: /查看更多评论/ }))
    await expect(fullPage).toBeVisible()
    // 等完整页接管焦点后再用键盘操作。
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('.rc-standalone'))).toBe(true)
    await enter(fullPage.locator('[data-comment="1"]').getByRole('button', { name: '回复 3' }))
    await expect(detail).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await expect(fullPage).toBeVisible()
    await expect(fullPage.locator('[data-comment="1"]').getByRole('button', { name: '回复 3' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(fullPage).toBeHidden()
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: /查看更多评论/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(comments).toBeFocused()

    // 在面板之间切换时，焦点不能被正在离场的面板抢回底部菜单。
    await open()
    await page.evaluate(() => {
      window.panelFocusLog = []
      document.addEventListener('focusin', e => {
        if (e.target.closest('.v-bottom-navigation')) window.panelFocusLog.push(e.target.textContent)
      })
    })
    await page.evaluate(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.set_menu('settings'))
    await expect(page.locator('[data-setting=notes_enabled]')).toBeVisible()
    await page.waitForTimeout(500) // include outgoing Vuetify transitions and delayed focus handlers
    expect(await page.evaluate(() => !!document.activeElement.closest('.v-overlay--active'))).toBe(true)
    expect(await page.evaluate(() => window.panelFocusLog)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(comments).toBeFocused()

    await enter(settings)
    await expect(page.locator('[data-setting=notes_enabled]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settings).toBeFocused()

    // 由外部触发元素打开时，该元素已不在页面上，回退到底部「评论」入口。
    await page.evaluate(() => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.on_open_annotations()
      trigger.remove()
    })
    await settled()
    await page.keyboard.press('Escape')
    await expect(comments).toBeFocused()
  })
}
