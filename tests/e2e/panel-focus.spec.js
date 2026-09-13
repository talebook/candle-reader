const { test, expect } = require('@playwright/test')
const { setupApiMock, SAMPLE_USER } = require('./helpers/mock-api')
const { gotoReader, waitForReaderRendered } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

for (const theme of ['white', 'grey']) for (const login of [false, true]) {
  test(`面板最终关闭恢复入口，切换不抢焦 ${theme} ${login ? 'login' : 'guest'}`, async ({ page }) => {
    await setupApiMock(page, login ? {
      'GET /api/user/info': { err: 'ok', data: SAMPLE_USER },
      'GET /api/review/me': { err: 'ok', data: { count: 0 } },
    } : {})
    await page.addInitScript(theme => localStorage.setItem('readerSettings', JSON.stringify({ theme, show_selection_toolbar: false })), theme)
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.waitForFunction(() => document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.current_toc)
    const notes = page.locator('.v-bottom-navigation').getByRole('button', { name: /^笔记/ })
    const settings = page.locator('.v-bottom-navigation').getByRole('button', { name: '设置' })
    const dialog = page.getByRole('dialog', { name: '阅读笔记' })
    async function enter(button) { await button.focus(); await page.keyboard.press('Enter') }
    async function open() { await enter(notes); await expect(dialog).toBeVisible() }
    async function settledInPanel() {
      await page.waitForTimeout(500) // include outgoing Vuetify transitions and delayed focus handlers
      expect(await page.evaluate(() => !!document.activeElement.closest('.v-overlay--active'))).toBe(true)
      expect(await page.evaluate(() => window.panelFocusLog || [])).toEqual([])
    }
    await open()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(notes).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(settings).toBeFocused()

    await open()
    await enter(page.getByRole('button', { name: '关闭笔记', exact: true }))
    await expect(notes).toBeFocused()

    for (const category of ['当前章评', '本书评论']) {
      for (const close of ['escape', 'button']) {
        await open()
        await enter(page.getByRole('button', { name: category, exact: true }))
        const closeButton = page.getByRole('button', { name: '关闭评论面板' })
        await expect(closeButton).toBeVisible()
        if (close === 'escape') await page.keyboard.press('Escape')
        else await enter(closeButton)
        await expect(notes).toBeFocused()
      }
      await open()
      await page.evaluate(() => {
        window.panelFocusLog = []
        if (!window.trackPanelFocus) {
          window.trackPanelFocus = true
          document.addEventListener('focusin', e => {
            if (e.target.closest('.v-bottom-navigation')) window.panelFocusLog.push(e.target.textContent)
          })
        }
      })
      await enter(page.getByRole('button', { name: category, exact: true }))
      await expect(page.getByRole('button', { name: '返回笔记', exact: true })).toBeVisible()
      await settledInPanel()
      await enter(page.getByRole('button', { name: '返回笔记', exact: true }))
      await expect(dialog).toBeVisible()
      await settledInPanel()
      await enter(page.getByRole('button', { name: '前往设置开启工具栏' }))
      await expect(page.locator('[data-setting=notes_enabled]')).toBeVisible()
      await settledInPanel()
      await page.keyboard.press('Escape')
      await expect(notes).toBeFocused()
    }
    await enter(settings)
    await expect(page.locator('[data-setting=notes_enabled]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settings).toBeFocused()
    await open()
    await page.locator('.annotation-bottom-sheet .v-overlay__scrim').click({ position: { x: 10, y: 100 } })
    await expect(notes).toBeFocused()
    await page.evaluate(() => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      document.querySelector('#app').__vue_app__._instance.subTree.component.proxy.on_open_annotations()
      trigger.remove()
    })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(notes).toBeFocused()
  })
}
