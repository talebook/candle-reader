// 阅读器测试通用辅助函数

const HARNESS_URL = '/tests/e2e/fixtures/reader-harness.html'

/**
 * 打开阅读器测试页，并等待底部导航栏渲染完成。
 * 底部导航是静态模板，不依赖 epub 加载，因此可作为“页面就绪”的稳定信号。
 */
async function gotoReader(page) {
  await page.goto(HARNESS_URL)
  await page.getByRole('button', { name: '目录' }).waitFor({ state: 'visible' })
}

/**
 * 通过 Vue 内部实例直接调用 EpubReader.set_menu()，可靠地打开指定面板，
 * 无需依赖 epub iframe 内的文字选择/图标点击（那类交互在 E2E 中极易 flaky）。
 *
 * 组件树：#app -> CandleReader(root) -> EpubReader(唯一子组件)
 */
async function openPanel(page, name) {
  await page.evaluate((panel) => {
    const app = document.querySelector('#app').__vue_app__
    const epub = app._instance.subTree.component // CandleReader 的根 vnode 即 EpubReader
    epub.proxy.set_menu(panel)
  }, name)
}

/** 读取 EpubReader 上某个响应式数据的当前值，便于断言内部状态。 */
async function readState(page, key) {
  return page.evaluate((k) => {
    const app = document.querySelector('#app').__vue_app__
    const epub = app._instance.subTree.component
    return epub.proxy[k]
  }, key)
}

/**
 * 模拟“选中段落 -> 发段评”的入口：调用 show_selected_comments，
 * 它会写入 comments_location、拉取评论列表并打开评论面板。
 * 相比裸调 set_menu('comments')，这里能让 comments_location 就绪，
 * 从而支持后续“发表评论”用例。
 */
async function openCommentsPanel(page, toc) {
  await page.evaluate((t) => {
    const app = document.querySelector('#app').__vue_app__
    const epub = app._instance.subTree.component
    const tocObj = t || { label: '第一章', chapter_id: 7 }
    epub.proxy.show_selected_comments(tocObj, 3, 'epubcfi(/6/4!/4/2)')
  }, toc)
}

module.exports = { HARNESS_URL, gotoReader, openPanel, readState, openCommentsPanel }
