# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 提交 / 推送 PR 前必须本地跑通 e2e（见 `AGENTS.md`）。通用编码准则见仓库外层 `~/CLAUDE.md`。

## 这是什么

candle-reader（秉烛夜读）是一个**可嵌入的 EPUB 阅读器**，以 Vue 3 + Vuetify 写成、用 Vite **library 模式**打包，供 talebook 书库服务嵌入使用。它不是独立 SPA：`src/main.js` 导出一个 `Reader` 类，宿主页面 `new Reader('#app', { book_url, display_url, themes_css, book_id, annotation_callbacks })` 即挂载。

## 常用命令

```bash
make dev              # 解压 public/demo/*.epub 后启动 vite（首次开发用这个，不是 npm run dev）
                      # 演示页 http://localhost:5001/demo.html ：西游记 + 纯内存版宿主，可体验全部评论功能
npm run dev           # vite dev server，端口 5001
npm run build         # vite build --lib → dist/candle-reader.es.js（并清理 demo 产物）
make dist             # build + 生成 dist/demo.html（同一份演示页，改为引用打包产物并带时间戳版本号）和介绍页 dist/index.html（源文件 intro.html）；make all 等同
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

**评论数据只走宿主回调，阅读器不直接请求后端。** 划线、文字评论、整书评论、回复、赞踩和登录态都通过构造 `Reader` 时注入的 `annotation_callbacks` 交给宿主（talebook）；契约见 `README.md`。`src/annotations.js` 把回调包成 `annotation_repository`，并在未注入回调时提供 `localStorage` 实现。不要在阅读器里新增对评论服务（BRS）或账号接口的直接请求。

**组件树。** `CandleReader.vue`（根，仅透传 props）→ `EpubReader.vue`（承载底部导航、epub.js 集成、主题、阅读进度、选区工具栏、评论编辑框、正文标记与段尾气泡）。子组件：
- `Settings.vue` 设置面板、`BookToc.vue` 目录、`AudiobookPlayer.vue` 听书
- `comments/ReaderComments.vue` —— 评论抽屉（panel 名 `annotations`）以及从它进入的完整评论页、评论详情页、删除确认；列表与单条评论分别是 `CommentList.vue`、`CommentItem.vue`。写评论和修改通过事件交回 `EpubReader` 的编辑框。

**面板切换靠 `set_menu(name)`。** 一次只开一个底部面板（`toc`/`settings`/`annotations`/`ai`/`hide`），它会把其余 `menu.panels[*]` 置 false。移动端是底部抽屉，≥850px 时目录是左侧侧边栏、评论和设置是右侧侧边栏。完整评论页和详情页是独立的全屏页面，用浏览器历史记录逐层返回，离开评论抽屉时一并退出。打开评论用 `open_comments(scope, paragraph)`。改动导航文案或入口时，相关 e2e 按可见文案（如「评论」「查看更多评论」）定位元素，务必同步。

**演示页。** 根目录 `demo.html` + `demo/memory-host.js`（`annotation_callbacks` 的纯内存参照实现，e2e 的 `mock-host.js` 也基于它）。改了回调契约要同步这两处和 `README.md`。

**主题。** `src/themes.js` + `themes_css`（运行时注入的皮肤 CSS）。图片皮肤需把 color-scheme / 透明背景注入正文 iframe 防白屏，相关回归在 `tests/e2e/reader-theme.spec.js`。顶部状态栏/灵动岛颜色由 `apply_theme_color` 改 `index.html` 里静态声明的 `<meta theme-color>`。

## 测试架构

评论数据由内存版宿主提供，不依赖真实 talebook。
- 入口用 `tests/e2e/fixtures/reader-harness.html`（复刻 `index.html`，`book_url` 用体积小的 `/demo/book1.epub`），**不要用 `index.html`**。加 `?host=1` 注入内存版宿主 `fixtures/mock-host.js`（完整回调契约，含多位读者、分页、投票、回复；`&guest=1` 为游客，`&extra=N` 追加 N 条评论）；不加时阅读器走 `localStorage`。测试里用 `window.__host` 检查调用记录（`calls`）、制造失败（`fail`）或挂起某次调用（`hold` / `release`）。
- `helpers/mock-api.js` 的 `setupApiMock(page, overrides)` 只用于仍走 HTTP 的接口（有声书）；它记录的 `calls` 也用来断言阅读器没有请求评论或账号接口。
- `helpers/reader.js`：`gotoReader`、`gotoHostReader`、`readerProxy`、通过 Vue 内部实例直接调 `EpubReader.set_menu()` 的 `openPanel`（避免依赖 iframe 内选段，减少 flaky）、`readState` 读组件响应式数据做断言。
- 浮层有展开动画：读几何位置或用键盘操作前，先用 `expect.poll` 等位置稳定、焦点进入浮层。
