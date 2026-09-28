const { test, expect } = require('@playwright/test')
const path = require('path')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel } = require('./helpers/reader')

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })

test('笔记设置行与原有分段设置行对齐', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await openPanel(page, 'settings')
  await page.locator('[data-setting=show_selection_toolbar]').waitFor()

  const geometry = await page.evaluate(() => {
    const names = ['翻页', '控制', '滚轮翻页', '笔记', '段落评论', '选区工具栏']
    const rect = el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return names.map(name => {
      const item = [...document.querySelectorAll('.v-list-item')]
        .find(el => el.querySelector('.v-row > .v-col:first-child span')?.textContent.trim() === name)
      const row = item.querySelector('.v-row')
      const columns = [...row.querySelectorAll(':scope > .v-col')]
      const group = item.querySelector('.v-btn-group')
      const style = getComputedStyle(item)
      return {
        name, item: rect(item), row: rect(row), labelColumn: rect(columns[0]),
        buttonColumn: rect(columns[1]), group: rect(group),
        buttons: [...group.querySelectorAll('.v-btn')].map(rect),
        marginTop: style.marginTop, marginBottom: style.marginBottom,
      }
    })
  })

  if (process.env.SETTINGS_EVIDENCE) {
    await page.screenshot({ path: path.resolve(__dirname, '../../../evidence', `settings-${process.env.SETTINGS_EVIDENCE}-402x874.png`) })
    console.log(`SETTINGS_GEOMETRY_${process.env.SETTINGS_EVIDENCE}=${JSON.stringify(geometry)}`)
  }

  if (process.env.SETTINGS_MEASURE_ONLY) return
  const reference = geometry[2]
  for (const row of geometry.slice(3)) {
    expect(row.labelColumn.x).toBe(reference.labelColumn.x)
    expect(row.labelColumn.width).toBe(reference.labelColumn.width)
    expect(row.buttonColumn.x).toBe(reference.buttonColumn.x)
    expect(row.buttonColumn.width).toBe(reference.buttonColumn.width)
    expect(row.group.x).toBe(reference.group.x)
    expect(row.group.height).toBe(reference.group.height)
    expect(row.buttons.map(button => [button.width, button.height])).toEqual(reference.buttons.map(button => [button.width, button.height]))
    expect(row.marginTop).toBe(reference.marginTop)
    expect(row.marginBottom).toBe(reference.marginBottom)
  }
  for (let index = 3; index < geometry.length; index++) {
    const previous = geometry[index - 1].item
    expect(geometry[index].item.y - previous.y - previous.height).toBe(8)
  }
})
