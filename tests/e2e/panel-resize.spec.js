// 宽屏侧边栏（目录、评论、设置）的宽度调整条：拖动、键盘调整、记住宽度；手机底部抽屉不显示。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoHostReader, openPanel } = require('./helpers/reader')

const sheetWidth = page => page.evaluate(() => {
  const content = [...document.querySelectorAll('.v-bottom-sheet__content')].find(el => el.getBoundingClientRect().width > 0)
  return Math.round(content.getBoundingClientRect().width)
})

test.beforeEach(async ({ page }) => {
  await setupApiMock(page)
})

test.describe('宽屏', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const [panel, label, side, width] of [['toc', '目录', 'left', 300], ['annotations', '评论', 'right', 420], ['settings', '设置', 'right', 380]]) {
    test(`${label}侧边栏显示胶囊分隔条，拖动调整宽度并记住`, async ({ page }) => {
      await gotoHostReader(page)
      await openPanel(page, panel)
      const resizer = page.getByRole('separator', { name: `调整${label}宽度` })
      await expect(resizer).toBeVisible()
      await expect(resizer.locator('.panel-resizer-knob')).toBeVisible()
      await expect.poll(() => sheetWidth(page)).toBe(width)

      // 拖动：朝外侧拉宽 100px
      const box = await resizer.boundingBox()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + (side === 'left' ? 50 : -50), y)
      // 拖动中宽度立即跟上指针，不带过渡动画
      expect(await sheetWidth(page)).toBe(width + 50)
      await page.mouse.move(x + (side === 'left' ? 100 : -100), y, { steps: 5 })
      await page.mouse.up()
      await expect.poll(() => sheetWidth(page)).toBe(width + 100)
      await expect(resizer).toHaveAttribute('aria-valuenow', String(width + 100))

      // 键盘：朝正文一侧收窄一步
      await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('v-bottom-sheet__content'))).toBe(true)
      await resizer.focus()
      await page.keyboard.press(side === 'left' ? 'ArrowLeft' : 'ArrowRight')
      await expect.poll(() => sheetWidth(page)).toBe(width + 84)

      // 刷新后沿用上次的宽度
      await page.reload()
      await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?._instance?.subTree?.component?.proxy?.current_toc)
      await openPanel(page, panel)
      await expect.poll(() => sheetWidth(page)).toBe(width + 84)

      // 双击恢复默认宽度
      await page.getByRole('separator', { name: `调整${label}宽度` }).dblclick()
      await expect.poll(() => sheetWidth(page)).toBe(width)
    })
  }

  test('宽度不小于 260px，并给正文至少留 360px；Home 恢复默认', async ({ page }) => {
    await gotoHostReader(page)
    await openPanel(page, 'annotations')
    const resizer = page.getByRole('separator', { name: '调整评论宽度' })
    // 面板展开动画结束时浮层会把焦点移进面板，等焦点进了面板再聚焦分隔条。
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('v-bottom-sheet__content'))).toBe(true)
    const box = await resizer.boundingBox()
    const y = box.y + box.height / 2
    // 拖到最窄、最宽都会被限制住
    await page.mouse.move(box.x + 4, y)
    await page.mouse.down()
    await page.mouse.move(box.x + 600, y, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => sheetWidth(page)).toBe(260)
    await expect(resizer).toHaveAttribute('aria-valuemin', '260')
    await expect(resizer).toHaveAttribute('aria-valuemax', '720')
    const left = await resizer.boundingBox()
    await page.mouse.move(left.x + 4, y)
    await page.mouse.down()
    await page.mouse.move(left.x - 900, y, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => sheetWidth(page)).toBe(720)
    await resizer.focus()
    await page.keyboard.press('Home')
    await expect.poll(() => sheetWidth(page)).toBe(420)
    await page.setViewportSize({ width: 900, height: 800 })
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => sheetWidth(page)).toBe(540)
  })

  test('分隔线与面板边界重合，胶囊 8×24，悬停与拖动时变为深蓝', async ({ page }) => {
    await gotoHostReader(page)
    for (const [panel, label, side, sheet] of [['toc', '目录', 'left', '.reader-side-left'], ['annotations', '评论', 'right', '.annotation-bottom-sheet'], ['settings', '设置', 'right', '.settings-bottom-sheet']]) {
      await openPanel(page, panel)
      const resizer = page.getByRole('separator', { name: `调整${label}宽度` })
      await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('v-bottom-sheet__content'))).toBe(true)
      const geometry = await resizer.evaluate((el, [side, sheet]) => {
        const pane = document.querySelector(`${sheet} > .v-bottom-sheet__content`).getBoundingClientRect()
        const knob = el.querySelector('.panel-resizer-knob').getBoundingClientRect()
        return {
          hit: el.getBoundingClientRect().width,
          line: el.getBoundingClientRect().x + 4,
          edge: side === 'left' ? pane.x + pane.width : pane.x,
          knob: [knob.width, knob.height],
        }
      }, [side, sheet])
      expect(geometry.hit).toBe(9)
      expect(Math.abs(geometry.line - geometry.edge)).toBeLessThan(0.5)
      expect(geometry.knob).toEqual([8, 24])
      const colors = () => resizer.evaluate(el => ({
        line: getComputedStyle(el, '::before').backgroundColor,
        knob: getComputedStyle(el.querySelector('.panel-resizer-knob')).backgroundColor,
        grip: getComputedStyle(el.querySelector('.panel-resizer-knob')).color,
      }))
      expect((await colors()).knob).not.toBe('rgb(37, 99, 235)')
      await resizer.hover()
      await expect.poll(colors).toEqual({ line: 'rgb(37, 99, 235)', knob: 'rgb(37, 99, 235)', grip: 'rgb(255, 255, 255)' })
      await page.mouse.move(0, 400)
    }
  })
})

test('手机上的底部抽屉没有宽度调整条', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await gotoHostReader(page)
  for (const panel of ['toc', 'annotations', 'settings']) {
    await openPanel(page, panel)
    await expect(page.locator('.panel-resizer')).toHaveCount(0)
  }
})
