const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel } = require('./helpers/reader')

for (const width of [320, 402]) {
  test(`开关设置使用左侧完整描述和右侧滑动开关 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 })
    await setupApiMock(page)
    await gotoReader(page)
    await openPanel(page, 'settings')
    const rows = page.locator('[data-setting]')
    await expect(rows).toHaveCount(4)
    await expect(rows.getByRole('button')).toHaveCount(0)

    // 在同一帧测量所有行，避免面板入场动画影响相邻行的坐标差。
    const { reference, geometry } = await rows.evaluateAll(items => {
      const item = items[0].previousElementSibling
      const button = item.querySelector('button')
      const row = item.getBoundingClientRect()
      const previous = item.previousElementSibling.getBoundingClientRect()
      const style = getComputedStyle(item)
      // 窄屏下原有两字标签可能换行；以原有控件高度和行内留白比较单行设置。
      const height = button.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      return {
        reference: { height, bottom: row.bottom, gap: row.top - previous.bottom },
        geometry: items.map(item => {
          const row = item.getBoundingClientRect()
          const label = item.querySelector('label').getBoundingClientRect()
          const toggle = item.querySelector('.v-selection-control__wrapper').getBoundingClientRect()
          return { top: row.top, bottom: row.bottom, height: row.height, labelLeft: label.left, labelRight: label.right, switchLeft: toggle.left, switchRight: toggle.right }
        }),
      }
    })
    let previousBottom = reference.bottom
    for (const row of geometry) {
      // 面板入场动画中的坐标带亚像素误差，按 0.01px 精度比较。
      expect(row.height).toBeCloseTo(reference.height, 2)
      expect(row.top - previousBottom).toBeCloseTo(reference.gap, 2)
      previousBottom = row.bottom
      expect(row.labelLeft).toBe(geometry[0].labelLeft)
      expect(row.switchRight).toBe(geometry[0].switchRight)
      expect(row.labelRight).toBeLessThanOrEqual(row.switchLeft)
      expect(row.switchRight).toBeLessThanOrEqual(width - 8)
    }
  })
}
