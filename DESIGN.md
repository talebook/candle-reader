# DESIGN.md

candle-reader（秉烛夜读）的架构设计与对外接口规范。改动阅读器之前先读这份文档；产品交互的细节约定见 `AGENTS.md`，开发命令与测试方式见 `CLAUDE.md`，接入示例见 `README.md`。

本文描述的是**当前实现**。改了这里描述的行为或接口，必须在同一次改动里更新本文。

## 1. 定位

candle-reader 是一个**可嵌入的 EPUB 阅读器组件**，不是独立应用：

- 用 Vue 3 + Vuetify 写成，Vite library 模式打包成 `dist/candle-reader.es.js` / `.umd.js` + `style.css`。
- 宿主页面（目前是 talebook 的在线阅读页）`new Reader('#app', options)` 挂载，整页都交给阅读器。
- 阅读器负责「怎么读、怎么交互」；数据「存在哪里、谁能看、怎么同步」全部属于宿主。

一句话边界：**阅读器只认识回调，不认识任何后端。** 评论数据、读者身份、权限、同步都通过宿主注入的 `annotation_callbacks` 完成。阅读器代码里不得出现对评论服务（BRS）或账号接口的直接请求。

## 2. 职责划分

| 能力 | 阅读器负责 | 宿主负责 |
|---|---|---|
| 电子书渲染 | 用 epub.js 渲染、翻页、主题、字号行距、阅读进度条 | 提供 `book_url`（解压目录或 `.epub`），保证可访问 |
| 选中文字 | 选区工具栏、复制、计算 CFI 和段落归属、选区预览 | — |
| 划线 / 评论的界面 | 抽屉、完整评论页、详情页、编辑框、赞踩按钮、删除确认、分页滚动、空态和错误态 | — |
| 正文标记 | 把当前读者本章的划线和评论画到正文上 | 通过 `load` 返回这些记录 |
| 段尾评论气泡 | 把数量画到对应段落末尾，点击进入本段评论 | 通过 `summary` 返回每段的公开评论数 |
| 评论存储 | 不存（未注入回调时才退化为本机 `localStorage`） | 唯一权威存储 |
| 读者身份与登录 | 游客互动时调用 `login`，之后重新取 `user` | 判断登录态、执行登录流程 |
| 可见性与权限 | 只做界面上的显示（如私密记录不显示赞踩） | **服务端强制**：私密不外泄、只能改删自己的、私密记录不接受投票和回复 |
| 排序与分页 | 透传 `cursor` / `limit`，按返回顺序展示，滚动到底取下一页 | 排序（自己的在前，再按时间倒序，覆盖整个结果集后再分页）、生成游标 |
| 计数 | 乐观更新赞踩，以宿主返回值为准 | `like_count` / `dislike_count` / `reply_count` / `user_vote` |
| 回复结构 | 按 `thread_id` 分组、控制缩进 | 根据 `reply_to_id` 推出 `thread_id`、`reply_to_name` |
| 删除 | 确认框、从界面移除 | 真删除及级联（见 5.4） |
| 外部同步 | 不感知 | 公开记录同步到 BRS 等外部服务 |
| 阅读设置、阅读位置、公开范围偏好 | 存在本机 `localStorage`（见 8） | — |
| 听书 | 播放器界面、正文高亮跟随 | 提供有声书 HTTP 接口（见 6.3，当前唯一的例外） |

判断一个新功能放在哪边时，问两个问题：

1. **离开这个宿主还成立吗？** 换一个宿主（另一个书库、纯本地 demo）也需要的交互逻辑，放阅读器。
2. **涉及数据归属、身份或权限吗？** 涉及就放宿主，阅读器只通过回调提出请求。

## 3. 嵌入接口

```js
import { Reader } from './candle-reader.es.js'   // 需先全局加载 jszip 与 epub.js，见 3.2

new Reader('#app', {
  book_url: '/books/1/',          // 必填。解压后的 EPUB 目录或 .epub 地址
  display_url: '',                // 首次打开的位置（章节 href 或 CFI）；有本机阅读位置时以本机为准
  book_id: 1,                     // 书的稳定标识；作为回调上下文和本机存储的隔离键
  themes_css: '/static/candle-reader/css/themes.css',  // 注入正文 iframe 的主题样式表
  annotation_callbacks: { ... },  // 评论回调，见 5；不传则使用本机 localStorage
  audiobook_edition_id: null,     // 有声书，见 6.3
  audiobook_manifest_url: '',
  debug: false,
})
```

### 3.1 选项

| 选项 | 类型 | 说明 |
|---|---|---|
| `book_url` | string | 必填 |
| `display_url` | string | 无本机阅读位置时的起始位置 |
| `book_id` | number / string | 回调上下文 `book_id`；缺省时本机存储改用 `book_url` 隔离 |
| `themes_css` | string | 默认 `theme.css`；须包含 `src/themes.js` 中纯色主题的同名 class 和评论气泡样式 |
| `annotation_callbacks` | object / null | 见 5 |
| `audiobook_edition_id` / `audiobook_manifest_url` | number / string | 有一个即显示「听书」入口 |
| `debug` | boolean | 在顶栏显示 epub.js 事件名，并在点击处画点，仅调试用 |

`server` 选项已废弃，传入会被忽略。

### 3.2 宿主页面的要求

- 先加载 `js/jszip-*.js`，再加载 `js/epub-*.js`。epub.js 依赖全局 `window.JSZip` 解压 `.epub`，顺序不能反。
- 阅读器占满整个页面：它会把 `html, body` 设为 `position: fixed; overflow: hidden`，防止 iOS Safari 整页回弹、地址栏收起导致正文重排。宿主不要在同一页面放需要滚动的其他内容。
- 页面需要 `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`；如需顶部状态栏随主题变色，静态声明 `<meta name="theme-color">`。
- 引入打包产物时给 `candle-reader.es.js` 和 `style.css` 带版本号，避免手机浏览器使用旧缓存（`make dist` 的做法）。

## 4. 内部架构

```
CandleReader.vue          根组件，只透传 props
└─ EpubReader.vue         epub.js 集成、底部菜单、面板切换、主题、选区工具栏、
   │                      评论编辑框、正文标记、段尾气泡、设置的应用与保存
   ├─ Settings.vue        设置面板
   ├─ BookToc.vue         目录
   ├─ AudiobookPlayer.vue 听书
   └─ comments/
      ├─ ReaderComments.vue  评论抽屉 + 完整评论页 + 评论详情页 + 删除确认
      ├─ CommentList.vue     分页列表（滚动到底取下一页、加载/错误/空态）
      └─ CommentItem.vue     单条记录（作者、时间、正文、修改/删除、赞/踩/回复）

src/annotations.js        把 annotation_callbacks 包装成 annotation_repository；本机 localStorage 实现
src/note-settings.js      旧设置迁移
src/themes.js             主题数据
demo/memory-host.js       回调契约的纯内存参照实现（演示页与 e2e 共用）
```

### 4.1 数据流

```
宿主回调  ←→  annotation_repository（src/annotations.js：补上下文、校验返回形状）
                 ├─ EpubReader：load / summary / save（划线、写评论、编辑）/ user / login
                 └─ ReaderComments：list / replies / save（回复）/ remove / vote
```

- 组件**只**通过 `annotation_repository` 访问数据，不直接调用 `annotation_callbacks`。
- `ReaderComments` 不自己打开编辑框：写评论和修改通过 `write` / `edit` 事件交回 `EpubReader`，保存成功后由 `EpubReader` 调用 `ReaderComments.apply_saved()` 刷新列表，并通过 `on_comments_changed()` 同步正文标记和段尾气泡。
- 同一条记录可能同时出现在抽屉、完整页、详情页里（是不同的对象副本）。修改计数或内容时用 `ReaderComments.patch(id, fields)` 同步所有副本。

### 4.2 面板与页面

- **底部面板**：`toc` / `settings` / `annotations`（评论抽屉）/ `ai`，一次只开一个，统一由 `EpubReader.set_menu(name)` 切换，`set_menu('hide')` 全部收起。打开评论请用 `open_comments(scope, paragraph)`，不要直接 `set_menu('annotations')`，否则列表不会按范围加载。
- **布局**：移动端为底部抽屉（评论抽屉占底部菜单上方区域的 90%）；宽度 ≥ 850px 时目录是左侧侧边栏，评论和设置是右侧侧边栏。都覆盖在正文上，不压缩正文，底部菜单保持可点。
- **独立页面**：完整评论页、评论详情页是全屏 `v-dialog`（class `rc-standalone`，z-index 2600，盖住顶栏和底部菜单）。每进入一层就 `history.pushState({ candle_comments: 层数 })`，返回按钮、Esc、浏览器后退都走 `history.back()`，由 `popstate` 统一退出到对应层数。离开评论抽屉时 `close_pages()` 会一并退回历史记录。
- **层级**：编辑框、删除确认在独立页面之上（class `rc-above-standalone`，z-index 2700）；Vuetify 给嵌套浮层的层级只比父级高一档，所以这两个值用 class 显式抬高，新增浮层时沿用。
- **焦点**：面板最终关闭时焦点回到打开它的入口（`panel_trigger`）；从详情页返回时焦点回到列表里那条评论的「回复」按钮。

### 4.3 选中文字与工具栏

- 选中事件**只用 epub.js 的 `rendition.on('selected')`**，不要自己监听 `selectionchange` 另起一套（曾经这样做，在 iOS 上问题更多，已回退）。
- `on_select_content` 计算：真实选区 `cfi`、所在段落 `paragraph_cfi` 与整段原文、是否跨段（跨段时归属**最后一个段落**）、章节（`find_toc`）。
- 工具栏位置：默认放在选区上方；触屏设备（`pointer: coarse`）优先放下方，避开 iOS 系统文字菜单。
- 选区预览（蓝色底色）只在开启「选中文字后显示工具栏」时绘制；`hide_toolbar()` 会一并清掉。
- 点击正文的判定（`on_click_content`）：
  - 快速拖选（按下到松开移动超过 8px）、双击选词：按选字处理，不翻页。
  - 已经选中文字后再点一下：只取消选中、收起工具栏，这一下不翻页。iOS 在 click 之前就会清掉系统选区，所以以 `selection_active`（epub.js 报告过选中）为准，不以点击时读到的选区为准。
- 开启工具栏时，正文注入 `-webkit-touch-callout: none` 尝试关闭 iOS 系统文字菜单；关闭工具栏时保留系统菜单用于复制。
- 正文 iframe 里**不拦截** `touchmove`：iOS 拖动选区两端的手柄依赖原生拖动。左右翻页模式下只拦截阅读区域外框（`#main`、顶栏、底部菜单）的拖动。

### 4.4 章节识别

- 章节标识是目录项的 `label`（去首尾空白），作为回调里的 `chapter` 字段。宿主必须原样保存并用它查询，不要自行改写。
- 目录项都带锚点、多章共用一个正文文件时（如《西游记》），按位置取光标之前最近的一章（`find_toc_in_same_file`）。
- 正文文件不在目录里时，取文件内第一个标题作为章节名，没有标题则为「正文 N」。

## 5. 评论回调规范（annotation_callbacks）

### 5.1 统一模型

划线、文字评论、整书评论是**同一种记录**（统称「评论」），回复也是记录（带 `root_id`）。「本段 / 本章 / 全书 / 我的」是**查看范围**，不是记录类型；同一条公开记录可以出现在多个范围里，宿主不得为不同范围保存副本。

### 5.2 回调一览

```js
annotation_callbacks: {
  user(ctx),                                // → { id, nickname, avatar } | null
  login(ctx),                               // → void；游客互动时调用
  load({ ...ctx, chapter }),                // → Record[] 或 { annotations }
  list({ ...ctx, scope, chapter, paragraph_cfi, cursor, limit }),  // → Page
  summary({ ...ctx, chapter }),             // → [{ paragraph_cfi, count }] 或 { items }
  get({ ...ctx, id }),                      // → Record
  replies({ ...ctx, root_id, cursor, limit }),                     // → Page
  save(record, ctx),                        // → Record 或 { annotation }
  remove({ ...ctx, id }),                   // → 任意
  vote({ ...ctx, id, value }),              // → { like_count, dislike_count, user_vote }
}
// ctx = { book_id, book_url }
// Page = { items: Record[], next_cursor: string | null, has_more: boolean }（也接受纯数组，视为没有下一页）
```

- 所有回调都是异步函数（返回 Promise）。除 `save` 外，第一个参数都已并入 `ctx`；`save` 的上下文在第二个参数。
- `load` 和 `save` 必须提供，否则初始化失败。其余回调缺失时，用到的功能会显示「宿主未提供 xx 回调」错误，**不会静默退化到本机存储**。
- `user` 缺失视为游客；`login` 缺失时游客互动只会提示「请先登录」。

| 回调 | 何时调用 | 宿主要做的 |
|---|---|---|
| `user` | 初始化、`login` 完成后 | 返回当前读者；游客返回 `null` |
| `login` | 游客点赞踩、回复、写评论、划线、看「我的」时 | 引导登录（跳转、弹窗均可）；resolve 后阅读器重新调用 `user` |
| `load` | 进入新章节、保存后、打开「显示全部划线和评论」时 | 返回**当前读者自己**在该章节的顶层记录（含私密），用于正文标记 |
| `list` | 打开抽屉 / 切换范围 / 滚动到底 | 按 `scope` 过滤、排序、分页（见 5.3） |
| `summary` | 进入新章节（同一章 1 分钟内不重复）、评论增删后、打开「显示全部划线和评论」时 | 返回该章节各段**公开顶层文字评论**的数量 |
| `get` | 预留：按 id 取单条（如深链进入详情） | 不可见时按不存在处理 |
| `replies` | 进入详情页 / 滚动到底 | 返回某主评论的回复，**按时间正序**分页 |
| `save` | 划线、写评论、写整书评论、修改、回复、修改回复 | 按 `id` 或 `client_id` 判断新建还是修改（幂等）；返回保存后的完整记录 |
| `remove` | 删除确认后 | 真删除并级联（见 5.4） |
| `vote` | 点赞 / 踩 / 再点取消 | 每人每条一票；返回最新计数和当前读者的票 |

### 5.3 list 的范围

| scope | 返回 | 不含 |
|---|---|---|
| `paragraph` | 归属 `paragraph_cfi` 这一段的公开顶层评论 | 私密记录、回复 |
| `chapter` | `chapter` 这一章的全部公开顶层评论 | 整书评论、私密记录、回复 |
| `book` | 全书公开顶层评论，含整书评论 | 私密记录、回复 |
| `mine` | 当前读者在本书的全部顶层记录，含私密划线、私密文字 | 别人的记录、回复 |

排序：当前读者自己的在前，其余按时间倒序。**排序必须覆盖整个结果集后再分页**，不能每页各自排序。游标由宿主生成，阅读器原样回传；切换范围时游标重置，迟到的旧范围响应会被丢弃。

### 5.4 记录字段

| 字段 | 谁填 | 说明 |
|---|---|---|
| `id` | 宿主 | 稳定 id |
| `client_id` | 阅读器 | 新建时生成的 UUID；宿主用它做幂等 |
| `annotation_type` | 阅读器 | `highlight` 划线 / `note` 文字评论 / `book_comment` 整书评论；回复也是 `note` |
| `is_private` | 阅读器 | 划线固定 `true`；回复不使用（跟随主评论） |
| `chapter` | 阅读器 | 章节名（见 4.4）；整书评论为空串 |
| `cfi` | 阅读器 | **归属位置**：划线是精确选区；文字评论是所在段落（跨段归属最后一段）；整书评论是全书开头 `epubcfi(<第一个正文文件>!/4)` |
| `range_cfi` | 阅读器 | 真实选区；与 `cfi` 分开保存，不得用归属位置覆盖 |
| `quote_text` | 阅读器 | 单段文字评论为整段原文；跨段评论和划线为所选文字 |
| `content` | 阅读器 | 评论内容；划线为空串 |
| `color` | 阅读器 | 标记颜色：划线 `yellow`，评论 `blue` |
| `root_id` | 阅读器 | 回复所属的主评论；顶层记录为空 |
| `reply_to_id` | 阅读器 | 回复对象（主评论或另一条回复）；空表示直接回复主评论 |
| `thread_id` | 宿主 | 所属第一层回复；直接回复主评论的为空。由宿主根据 `reply_to_id` 推出，不信任客户端 |
| `reply_to_name` | 宿主 | 回复对象的昵称，用于显示「回复 某人：」 |
| `author_name` / `is_mine` | 宿主 | 作者昵称；是否当前读者所写（决定修改、删除入口） |
| `created_at` | 宿主 | ISO 时间 |
| `like_count` / `dislike_count` / `user_vote` / `reply_count` | 宿主 | 计数与当前读者的票（`1` / `-1` / `0`）；`reply_count` 只对顶层记录有意义 |

修改时阅读器只发 `{ id, client_id, annotation_type, content, is_private }`（回复为 `{ id, client_id, root_id, content }`），宿主只更新这些字段。

### 5.5 宿主必须在服务端保证的规则

1. 私密记录及其全部回复，只有主评论作者可见；对其他人按「不存在」处理，包括 `get` / `replies` / `vote` / 回复的 `save`。
2. 回复没有自己的公开范围，跟随主评论。公开评论改为私密后，已有回复只有主评论作者能看到，不能再投票或回复。
3. 只能修改、删除自己的记录。
4. 删除是真删除：删主评论连同全部回复和投票；删第一层回复连同其下回复。
5. 划线固定私密；私密记录不接受投票。
6. 回复的 `root_id` / `reply_to_id` 必须属于同一本书、同一主评论。
7. `summary` 只统计公开的顶层文字评论，不计私密记录、回复、投票。

### 5.6 错误约定

- 回调失败时 **reject 一个 `Error`，`message` 写给读者看的原因**（如「请先登录」「这条评论已不存在」），阅读器会原样展示。
- 列表失败：显示可重试的错误态，已加载的内容保留。
- 保存失败：编辑框不关、选区不丢，可以再次保存；划线失败时正文不出现标记。
- 投票失败：界面恢复到投票前的计数和状态。
- 阅读器不重试，重试由读者触发。

### 5.7 本机实现与参照实现

- **不传 `annotation_callbacks`**：使用 `src/annotations.js` 的 `localStorage` 实现，按 `book_id`（缺省为 `book_url`）隔离，键为 `candle-reader:annotations:v1:<book>`。只有当前浏览器这一位读者，「公开」不会真的对他人生效，编辑框会提示这一点。
- **参照实现**：`demo/memory-host.js` 完整实现了本节所有规则，是写新宿主时的对照样本；`demo.html` 和 e2e 的 `tests/e2e/fixtures/mock-host.js` 都基于它。改契约时三处（本文、`README.md`、`memory-host.js`）同步修改。

## 6. 其他对外依赖

### 6.1 主题样式表（themes_css）

- 纯色主题以 class 形式写在样式表里（`.white` / `.eyecare` / `.grey` / `.dark`），epub.js 把它注入正文 iframe 并给 body 加上对应 class。
- 段尾气泡（`.comment-icon` / `.comment-count`）的样式也在这里。深色主题的 `.grey *` / `.dark *` 会给所有元素刷底色，新增插入正文的元素时注意显式设透明。
- 图片皮肤不靠样式表：阅读器把背景图铺在外层 `#main`，并向 iframe 注入透明背景、`color-scheme` 和文字色（`apply_custom_style`）。

### 6.2 阅读器向正文注入的内容

- 段尾评论气泡 `div.comment-icon`；计算段落原文和 CFI 时会跳过它，不影响选区与引用。
- epub.js 标记（class `candle-reader-annotation`）：同一 CFI 只画一个，记录可以有多条。
- 行距、字距、`-webkit-touch-callout` 等通过 `rendition.themes.default()` 注入。

### 6.3 有声书（例外）

听书目前**直接请求宿主的 HTTP 接口**（带 cookie），而不是通过回调：

- `GET` 清单：`audiobook_manifest_url`，缺省为 `/api/audiobooks/<edition_id>/manifest`
- `GET` 章节时间轴：清单里的 `timeline_url`，缺省为 `/api/audiobooks/<id>/chapters/<n>/timeline`
- `POST /api/audiobooks/<id>/sessions`，`PATCH` / `POST /api/audiobook-sessions/<session_id>`：上报收听进度

这是历史遗留的例外，接口属于宿主（talebook），不是评论服务。新增功能不要再走这种方式；若以后改造听书，按第 5 节的方式改成回调。

## 7. 设置

| 键 | 默认 | 说明 |
|---|---|---|
| `flow` | `paginated` | `paginated` 左右点击翻页 / `scrolled` 上下滑动 |
| `paging_control` | `mouse_and_keyboard` | 或 `keyboard_only` |
| `wheel_paging` | `true` | 左右翻页时鼠标滚轮翻页 |
| `font_size` / `line_height` / `letter_spacing` / `brightness` | 18 / 1.5 / 0 / 100 | |
| `theme` / `theme_mode` / `theme_day` / `theme_night` | `white` / `day` / `white` / `grey` | 白天/夜晚按钮在最近使用的两套之间切换 |
| `show_comments` | `true` | 「显示全部划线和评论」：正文划线标记与段尾气泡 |
| `show_selection_toolbar` | `true` | 「选中文字后显示工具栏」 |

两个评论开关相互独立，关闭都不删除数据，评论入口始终可用。早期的总开关 `notes_enabled` 已去掉，迁移规则见 `src/note-settings.js`。

## 8. 本机存储

| 键 | 内容 |
|---|---|
| `readerSettings` | 第 7 节的设置 |
| `lastReadPosition_<book_url>` | 上次阅读位置（CFI）；有值时优先于 `display_url` |
| `candle-reader:comment-public` | 新建评论的公开范围偏好；只在新建保存成功后更新，编辑已有记录、划线不改它 |
| `candle-reader:annotations:v1:<book>` | 未注入回调时的本机评论数据 |

所有读写都要 `try/catch`：无痕模式等情况下 `localStorage` 可能不可用，不能因此挡住阅读。

## 9. 加载与错误处理

- 正文 60 秒未显示时提示「加载较慢」但不中断加载，加载完成后提示自动关闭；真正加载失败时提示「加载失败」。两者都可「重试」，重试会先销毁上一次的 rendition。
- 回调错误见 5.6。阅读器内部计算（如段落序号）失败不得挡住主流程（工具栏、翻页）。

## 10. 扩展指引

**新增一个需要数据的功能**

1. 先判断归属（第 2 节）。属于宿主的数据，设计为新的回调，参数并入 `ctx`，返回值形状写进第 5 节。
2. 在 `src/annotations.js` 的仓库包装里加方法：补上下文、校验返回形状；回调缺失时抛出明确错误，不要静默退化。
3. 在 `demo/memory-host.js` 实现它，让演示页和 e2e 可用。
4. 组件只通过 `annotation_repository` 调用。
5. 同步更新本文、`README.md`、`AGENTS.md`（若改变产品交互）。

**新增一个面板或页面**

- 底部面板加入 `menu.panels`，通过 `set_menu` 切换；独立全屏页面沿用 `rc-standalone` 和历史记录栈，新增浮层沿用 `rc-above-standalone`。

**不要做的事**

- 不要在阅读器里请求评论服务或账号接口，也不要新增 `$backend` 一类的全局请求工具。
- 不要在阅读器里做权限判断来「保护」数据：界面上的隐藏只是体验，权限以宿主为准。
- 不要为段落、章节、全书分别保存同一条评论的副本。
- 不要另起一套选区监听替代 epub.js 的 `selected` 事件。
- 不要在正文 iframe 里拦截 `touchmove`。

## 11. 测试与演示

- e2e：Playwright，全部 mock，不依赖真实宿主。入口 `tests/e2e/fixtures/reader-harness.html`；加 `?host=1` 注入内存宿主（`&guest=1` 游客，`&extra=N` 追加 N 条评论），不加则走本机存储。提交前全量通过（见 `AGENTS.md`）。
- 演示：`make dev` 后打开 `/demo.html`；`make dist` 生成可直接部署的 `dist/demo.html` 和介绍页 `dist/index.html`。演示页加 `?diag=1` 显示选中文字相关事件，用于真机排查。
- 真机差异：iOS Safari 的选字、系统菜单、点击时序与桌面浏览器（包括桌面 Safari 的手机模拟）不同，涉及选区和触摸的改动必须在 iPhone 上实测。
