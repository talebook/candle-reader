# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 提交 / 推送 PR 前必须本地跑通 e2e（见 `AGENTS.md`）。通用编码准则见仓库外层 `~/CLAUDE.md`。

## 这是什么

candle-reader（秉烛夜读）是一个**可嵌入的 EPUB 阅读器**，以 Vue 3 + Vuetify 写成、用 Vite **library 模式**打包，供 talebook 书库服务嵌入使用。它不是独立 SPA：`src/main.js` 导出一个 `Reader` 类，宿主页面 `new Reader('#app', { server, book_url, display_url, themes_css })` 即挂载。

## 常用命令

```bash
make dev              # 解压 public/demo/*.epub 后启动 vite（首次开发用这个，不是 npm run dev）
npm run dev           # vite dev server，端口 5001
npm run build         # vite build --lib → dist/candle-reader.es.js（并清理 demo 产物）
make all              # build + 给 dist/demo.html 资源打时间戳版本号（缓存刷新）
make install          # 把 dist/ 拷进本地 talebook 的 static 目录
npm run lint          # eslint --fix（standard 风格）

npm run test:e2e                      # Playwright 全量 e2e（自动拉起 dev server）
npx playwright test comments-login    # 只跑某个 spec
npx playwright test -g "退出登录"      # 按用例标题过滤
npm run test:e2e:ui                   # 带调试面板
```

端口冲突：若本机另有 candle-reader 副本占用 5001，Playwright 会误连它（`reuseExistingServer`）。改用本仓库自己的端口：`npx vite --port 5009 --strictPort &` 再 `E2E_PORT=5009 npm run test:e2e`。

## 架构要点

**EPUB 渲染依赖全局 UMD 脚本，不是 npm 依赖。** `index.html` / 测试 harness 里先后引入 `js/jszip-*.js` 和 `js/epub-*.js`，epub.js 靠全局 `window.JSZip` 解压 `.epub`，**JSZip 必须在 epub.js 之前加载**。因此 headless 环境下正文渲染不完整——e2e 刻意不断言 epub 正文/目录渲染（属第三方渲染器行为）。

**所有后端数据走 `$backend`。** `src/plugins/server.js` 注入全局 `this.$backend(url, options)`，对 `server + url` 发 `fetch`（`credentials: 'include'`）。`server` 在构造 `Reader` 时传入。约定返回 `{ err, msg, data }`：`err === 'ok'` 为成功；`err === 'exception'` 会触发全局 alert；`need_login` 类表示游客态。网络失败兜底返回 `{ err: 'network_error', data: {} }`，所以**调用方需对 `rsp.data.*` 做空值兜底**（如列表赋值 `rsp.data.list || []`）。

**组件树几乎全在一个文件里。** `CandleReader.vue`（根，仅透传 props）→ `EpubReader.vue`（~1300 行，承载底部导航、epub.js 集成、主题、阅读进度、评论逻辑的「全家桶」组件）。各面板是它的子组件：
- `Settings.vue` 设置面板、`BookToc.vue` 目录、`Guest.vue` 登录对话框、`UserCenter.vue` 已登录用户中心
- `BookReview.vue` —— 底部「评论」按钮打开的**本书评论**面板（panel 名为 `more`）。游客态显示「点击登录」入口（emit `login`），已登录显示用户行（emit `open-settings`）
- `BookComments.vue` —— **章评/段评**面板（panel 名 `comments`），从正文 iframe 选段触发

**面板切换靠 `set_menu(name)`。** 一次只开一个底部面板（`toc`/`settings`/`more`/`comments`/`ai`/`hide`），它会把其余 `menu.panels[*]` 置 false。登录框（`show_login`）和用户中心（`show_user_center`）是独立 overlay，由 `BookReview` 的事件触发，不走 `set_menu`。改动导航文案或入口时，相关 e2e 按可见文案（如「评论」「点击登录，发表评论」）定位元素，务必同步。

**主题。** `src/themes.js` + `themes_css`（运行时注入的皮肤 CSS）。图片皮肤需把 color-scheme / 透明背景注入正文 iframe 防白屏，相关回归在 `tests/e2e/reader-theme.spec.js`。顶部状态栏/灵动岛颜色由 `apply_theme_color` 改 `index.html` 里静态声明的 `<meta theme-color>`。

## 测试架构

后端**全量 mock**，不依赖真实 talebook。
- 入口用 `tests/e2e/fixtures/reader-harness.html`（复刻 `index.html`，但 `server` 指同源、`book_url` 用体积小的 `/demo/book1.epub`），**不要用 `index.html`**。
- `helpers/mock-api.js` 的 `setupApiMock(page, overrides)`：默认游客态；未显式 mock 的接口返回安全空响应 `{ err:'ok', data:{} }`（注意：这意味着 `data.list` 等字段会是 `undefined`，需在应用侧兜底）。
- `helpers/reader.js`：`gotoReader`、以及通过 Vue 内部实例直接调 `EpubReader.set_menu()` 的 `openPanel` / `openCommentsPanel`（避免依赖 iframe 内选段，减少 flaky）；`readState` 读组件响应式数据做断言。
