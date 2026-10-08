# candle-reader

秉烛夜读。

## 演示

```bash
make dev    # 打开 http://localhost:5001/demo.html
make dist   # 打包，并生成可直接部署的 dist/demo.html
```

演示页用《西游记》和一个纯内存版宿主（`demo/memory-host.js`，完整实现下面的回调契约），可以体验划线、评论、回复、赞踩、「我的」和游客登录引导；数据只在内存里，刷新即重置。

## 划线与评论接入

划线、文字评论和整书评论是同一种记录，统称「评论」。阅读器负责全部界面：选区工具栏、评论抽屉、完整评论页、评论详情页、编辑框、赞踩与回复。**阅读器自身不请求任何评论或账号服务**，数据与登录态全部通过初始化时注入的 `annotation_callbacks` 交给宿主：

```js
new Reader('#app', {
  book_url: '/books/1/',
  book_id: 1,
  annotation_callbacks: {
    async user() {},                    // 当前读者 { id, nickname, avatar }；游客返回 null
    async login() {},                   // 游客触发互动时调用，由宿主引导登录
    async load({ chapter }) {},         // 当前读者在本章的记录（用于正文标记），返回 Annotation[]
    async list({ scope, chapter, paragraph_cfi, cursor, limit }) {},  // 顶层记录分页
    async summary({ chapter }) {},      // [{ paragraph_cfi, count }]，段尾气泡的公开评论数
    async get({ id }) {},               // 单条记录
    async replies({ root_id, cursor, limit }) {},                     // 某条评论的回复分页
    async save(annotation, { book_id, book_url }) {},                 // 新建或修改，返回保存后的记录
    async remove({ id }) {},            // 真删除
    async vote({ id, value }) {},       // value: 1 赞 / -1 踩 / 0 取消；返回 { like_count, dislike_count, user_vote }
  },
})
```

除 `save` 外，每个回调的第一个参数都会并入 `{ book_id, book_url }`。`load` 与 `save` 必须同时提供；其余回调缺失时，对应功能会显示明确错误，不会静默改写到本地。

分页回调返回 `{ items, next_cursor, has_more }`（也接受纯数组，视为没有下一页）。`list` 的 `scope`：

| scope | 返回 |
|---|---|
| `paragraph` | 归属 `paragraph_cfi` 这一段的公开文字评论 |
| `chapter` | 本章全部公开文字评论，不含整书评论 |
| `book` | 全书公开评论，含整书评论 |
| `mine` | 当前读者在本书的全部记录，含私密划线与私密文字 |

公开范围的列表由宿主排序：当前读者自己的在前，再按时间倒序，**排序覆盖整个结果集后再分页**。回复按时间正序。

记录字段：

- `id` / `client_id`：稳定标识；`save` 按它们判断新建还是修改。
- `annotation_type`：`highlight`（划线）、`note`（文字评论）、`book_comment`（整书评论）。
- `is_private`：划线固定 `true`。回复没有自己的公开范围，跟随主评论；主评论为私密时，其回复只对主评论作者可见。
- `chapter`、`cfi`、`range_cfi`、`quote_text`：`cfi` 是评论归属的位置——划线为精确选区，文字评论为所在段落（跨段选区归属最后一段），整书评论为全书开头；`range_cfi` 保留真实选区。
- `content`、`created_at`、`author_name`、`is_mine`。
- `like_count`、`dislike_count`、`user_vote`（`1` / `-1` / `0`）、`reply_count`。
- 回复：`root_id`（所属主评论）、`reply_to_id`（回复对象，空表示回复主评论）、`reply_to_name`、`thread_id`（所属第一层回复，由宿主根据 `reply_to_id` 推出；第一层回复为空）。

宿主需要保证：非作者访问私密记录及其回复时按不存在处理；`remove` 主评论时连同全部回复和投票删除，删除第一层回复时连同其下回复删除；私密记录不接受投票和回复。

不传 `annotation_callbacks` 时，阅读器按 `book_id`（缺省时按 `book_url`）隔离并保存到浏览器 `localStorage`：只有当前浏览器这一位读者，公开范围不会真的对他人生效。回调已经注入但执行失败时不会静默写入本地，避免宿主数据和本地数据产生不可见分叉。

“设置”里有两个相互独立的开关，都不删除数据，评论入口始终可用：

- 显示全部划线和评论：控制正文里的划线标记和段尾的评论数量气泡（有评论的段落只显示气泡，不铺底色）。
- 选中文字后显示工具栏：控制选区工具栏，关闭后选中文字只出现系统自带的菜单。

底部固定为目录、白天/夜晚、评论、设置，听书在顶部。完整的交互约定见 `AGENTS.md`。

## 听书接入

传入 `audiobook_callbacks` 后显示「听书」入口。宿主提供章节清单（`manifest`）和时间轴（`timeline`），可选提供收听会话与进度上报（`start_session` / `report_progress` / `end_session`）。阅读器不直接请求有声书接口，音频文件按清单里的 `audio_url` 由浏览器加载。完整契约见 `DESIGN.md` 第 6.3 节。

旧 `readerSettings` 自动迁移：早期的总开关 `notes_enabled` 已去掉，曾经关闭它的读者迁移后两个开关都按关闭处理；`show_comments` 保留，`show_selection_toolbar` 缺失时取旧 `show_annotations`（缺失按开启）。
