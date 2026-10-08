// 阅读主题（配色 + 背景图皮肤）。
// 这些用例只校验主题选择对 Vue 状态的影响（settings.theme / theme_mode），
// 不依赖 epub 正文渲染，因此在 mock harness 下稳定可跑。
const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { gotoReader, openPanel, readState, waitForReaderRendered, readIframeStyle } = require('./helpers/reader')

const themeMode = (page) => readState(page, 'settings').then(s => s.theme_mode)
const themeId = (page) => readState(page, 'settings').then(s => s.theme)

// 打开设置 →「更多皮肤」二级窗口 → 点击指定名字的主题卡片
async function pickTheme(page, name) {
  await openPanel(page, 'settings')
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.locator('.theme-cell', { hasText: name }).locator('.theme-card').click()
}

test('设置面板有 4 个快捷皮肤图标和「更多皮肤」入口', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  await expect(page.getByRole('button', { name: '更多', exact: true })).toBeVisible()
})

test('「更多皮肤」窗口展示完整皮肤列表并按白天/夜晚分区', async ({ page }) => {
  await gotoReader(page)
  await openPanel(page, 'settings')
  await page.getByRole('button', { name: '更多', exact: true }).click()
  for (const name of ['白色', '护眼', '夜灰', '纯黑', '竹林清风', '故纸堆', '灰土', '星夜']) {
    await expect(page.locator('.theme-cell', { hasText: name })).toBeVisible()
  }
  // 白天/夜晚分区标题
  await expect(page.locator('.theme-group-label', { hasText: '白天' })).toBeVisible()
  await expect(page.locator('.theme-group-label', { hasText: '夜晚' })).toBeVisible()
})

test('「更多皮肤」用小勾标注当前白天与夜晚各自选用的皮肤', async ({ page }) => {
  await gotoReader(page)
  // 选一套白天图片皮肤 → theme_day=竹林清风；theme_night 维持默认「夜灰」
  await pickTheme(page, '竹林清风')
  await openPanel(page, 'settings')
  await page.getByRole('button', { name: '更多', exact: true }).click()
  // 当前白天皮肤（竹林清风）与当前夜晚皮肤（夜灰）各有一个小勾，且全场恰好两个
  await expect(page.locator('.theme-cell', { hasText: '竹林清风' }).locator('.theme-check')).toBeVisible()
  await expect(page.locator('.theme-cell', { hasText: '夜灰' }).locator('.theme-check')).toBeVisible()
  await expect(page.locator('.theme-check')).toHaveCount(2)
  // 未被选用的皮肤没有小勾
  await expect(page.locator('.theme-cell', { hasText: '故纸堆' }).locator('.theme-check')).toHaveCount(0)
})

test('在「更多皮肤」里选图片皮肤，皮肤切换到对应 id（白天）', async ({ page }) => {
  await gotoReader(page)
  await pickTheme(page, '竹林清风')
  await expect.poll(() => themeId(page)).toBe('zhulin')
  await expect.poll(() => themeMode(page)).toBe('day')
})

test('在「更多皮肤」里选夜间皮肤，切换到夜间模式', async ({ page }) => {
  await gotoReader(page)
  await pickTheme(page, '星夜')
  await expect.poll(() => themeId(page)).toBe('xingye')
  await expect.poll(() => themeMode(page)).toBe('night')
})

test('白天/夜晚切换按钮在最近的日/夜皮肤间切换', async ({ page }) => {
  await gotoReader(page)
  // 先经「更多皮肤」选定一套日间主题
  await pickTheme(page, '白色')
  await expect.poll(() => themeMode(page)).toBe('day')
  await openPanel(page, 'hide')
  // 底部「夜晚」按钮：切到夜间
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => themeMode(page)).toBe('night')
  // 再点一次：切回白天
  await page.getByRole('button', { name: /夜晚|白天/ }).click()
  await expect.poll(() => themeMode(page)).toBe('day')
})

// —— 回归：图片皮肤对正文 iframe 的真实渲染影响 ——
// 背景：夜间图片皮肤曾出现「图片不生效、背景纯白」。根因是外层 app 切到 dark 后，
// iframe 正文 color-scheme 仍是默认浅色，Chrome 判定「深色页面里嵌浅色内容」，
// 给 iframe 画布刷了一层不透明的白色 color-adjust 背景，盖住了 #reader 上的背景图。
// 修复：apply_custom_style 给图片皮肤的 iframe <html> 注入与主题模式一致的 color-scheme。
// 这些用例依赖 epub 正文真实渲染（harness 使用解压目录），断言注入到 iframe 内的真实样式。
test.describe('图片皮肤 iframe 渲染回归', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMock(page) // 真实渲染会发 /api 请求，统一 mock 掉
  })

  test('夜间图片皮肤：iframe color-scheme=dark 且正文背景透明（防白屏）', async ({ page }) => {
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      app._instance.subTree.component.proxy.apply_theme('xingye')
    })
    // 关键断言：color-scheme 跟随夜间模式为 dark —— 这是阻止白色 color-adjust 背景的开关
    expect(await readIframeStyle(page, 'html', 'colorScheme')).toBe('dark')
    // 正文 html/body 透明，才能透出 #main 背景图
    expect(await readIframeStyle(page, 'html', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)')
    expect(await readIframeStyle(page, 'body', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)')
    // 背景图铺在 #main 上（覆盖上/下状态栏，连续衔接），而非 #reader；状态栏透明透出底图，不加特殊半透明底
    const layout = await page.evaluate(() => ({
      mainHasImg: getComputedStyle(document.getElementById('main')).backgroundImage.includes('url('),
      readerImg: getComputedStyle(document.getElementById('reader')).backgroundImage,
      topBarBg: getComputedStyle(document.getElementById('status-bar-top')).backgroundColor,
      botBarBg: getComputedStyle(document.getElementById('status-bar-bottom')).backgroundColor,
    }))
    expect(layout.mainHasImg).toBe(true)
    expect(layout.readerImg).toBe('none')
    expect(layout.topBarBg).toBe('rgba(0, 0, 0, 0)')
    expect(layout.botBarBg).toBe('rgba(0, 0, 0, 0)')
  })

  test('白天图片皮肤：iframe color-scheme=light 且正文背景透明', async ({ page }) => {
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      app._instance.subTree.component.proxy.apply_theme('zhulin')
    })
    expect(await readIframeStyle(page, 'html', 'colorScheme')).toBe('light')
    expect(await readIframeStyle(page, 'body', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)')
  })

  test('图片皮肤切回纯色主题：清除 color-scheme 覆盖，恢复不透明底色', async ({ page }) => {
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      app._instance.subTree.component.proxy.apply_theme('xingye')
    })
    expect(await readIframeStyle(page, 'html', 'colorScheme')).toBe('dark')
    // 切到纯色夜灰：不再注入 html color-scheme/透明规则，正文恢复纯色不透明背景
    await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      app._instance.subTree.component.proxy.apply_theme('grey')
    })
    expect(await readIframeStyle(page, 'html', 'colorScheme')).toBe('normal')
    expect(await readIframeStyle(page, 'body', 'backgroundColor')).toBe('rgb(26, 26, 26)')
  })

  // 回归：夜灰/纯黑的 `.grey *`、`.dark *` 曾给评论数 span 刷上不透明底色，
  // 绝对定位的 span 盖住气泡上部，段尾气泡只剩尾巴、看不到轮廓。
  test('段尾评论气泡在各主题下都显示气泡轮廓', async ({ page }) => {
    await gotoReader(page)
    await waitForReaderRendered(page)
    await page.evaluate(() => {
      const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
      // 可能同时渲染了封面和下一章两个 iframe，取当前可见的那个；本页没有段落（如封面）时在末尾补一段文字再挂。
      // 气泡不参与排版、垂直居中在末行文字上，直接挂 body 会贴着封面图，取不到纯背景色做对比。
      const contents = r.rendition.getContents().find(c => {
        const rect = c.document.defaultView.frameElement.getBoundingClientRect()
        return rect.right > 0 && rect.left < window.innerWidth
      })
      const doc = contents.document
      const p = [...doc.querySelectorAll('p')].find(p => {
        const rect = p.getBoundingClientRect()
        return p.textContent.trim() && rect.left >= 0 && rect.right <= doc.defaultView.innerWidth
      })
      let target = p
      if (!target) {
        target = doc.createElement('p')
        target.textContent = '气泡'
        doc.body.appendChild(target)
      }
      r.add_icon_into_paragraph(contents, target, { paragraph_cfi: 'test', count: 7 }, null)
    })
    // 读取气泡所在 iframe 的主题 class、气泡样式，以及气泡在主页面中的位置
    const bubble = () => page.evaluate(() => {
      for (const f of document.querySelectorAll('#reader iframe')) {
        const doc = f.contentDocument
        const icon = doc && doc.querySelector('.comment-icon')
        if (!icon) continue
        const r = icon.getBoundingClientRect()
        const fr = f.getBoundingClientRect()
        return {
          themes: [...doc.body.classList],
          image: getComputedStyle(icon).backgroundImage,
          countBg: getComputedStyle(icon.querySelector('.comment-count')).backgroundColor,
          clip: { x: fr.x + r.x, y: fr.y + r.y, width: r.width, height: r.height },
        }
      }
      return null
    })
    for (const theme of ['white', 'grey', 'dark', 'xingye']) {
      await page.evaluate(theme => {
        const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
        r.update_settings({ ...r.settings, theme })
      }, theme)
      await expect.poll(() => bubble().then(b => b && b.themes)).toContain(theme)
      const b = await bubble()
      expect(b.image).toContain('data:image/svg+xml')
      expect(b.countBg).toBe('rgba(0, 0, 0, 0)')
      // 像素级：气泡顶部一条带（数字画不到的位置）必须有与背景明显不同的轮廓色
      const png = (await page.screenshot({ clip: b.clip })).toString('base64')
      const outline = await page.evaluate(async png => {
        const img = new Image()
        img.src = `data:image/png;base64,${png}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, img.width, img.height).data
        const bg = data.slice(0, 3) // 左上角在气泡圆角之外，取作背景色
        let count = 0
        for (let y = 0; y < Math.ceil(img.height * 0.15); y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4
            if (Math.max(...[0, 1, 2].map(c => Math.abs(data[i + c] - bg[c]))) > 60) count++
          }
        }
        return count
      }, png)
      expect(outline, `${theme} 主题下气泡顶部轮廓不可见`).toBeGreaterThan(0)
    }
  })
})

test('开启选中工具栏时正文关闭 iOS 系统文字菜单，关闭工具栏后恢复 @epub', async ({ page }) => {
  await setupApiMock(page)
  await gotoReader(page)
  await waitForReaderRendered(page)
  // Chromium 不认识 -webkit-touch-callout，样式表里留不下来，所以直接检查注入给正文的样式规则。
  const callout = () => page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    let rules
    const original = r.rendition.themes.default
    r.rendition.themes.default = value => { rules = value; return original.call(r.rendition.themes, value) }
    r.apply_custom_style()
    r.rendition.themes.default = original
    return rules['body, body *']['-webkit-touch-callout'] || null
  })
  expect(await callout()).toBe('none !important')
  await page.evaluate(() => {
    const r = document.querySelector('#app').__vue_app__._instance.subTree.component.proxy
    r.update_settings({ ...r.settings, show_selection_toolbar: false })
  })
  expect(await callout()).toBe(null)
})
