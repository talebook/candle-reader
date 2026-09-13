# candle-reader

秉烛夜读。

## 划线与笔记接入

阅读器负责文字选择工具栏、划线、笔记编辑、列表、定位和设置开关。宿主只需在初始化时按需注入异步数据回调：

```js
new Reader('#app', {
  book_url: '/books/1/',
  book_id: 1,
  annotation_callbacks: {
    async load({ book_id, book_url, chapter }) {
      // 返回 Annotation[]，也可以返回 { annotations: Annotation[] }
      return api.loadAnnotations({ book_id, chapter })
    },
    async save(annotation, { book_id, book_url }) {
      // 返回 Annotation，也可以返回 { annotation: Annotation }
      return api.saveAnnotation(book_id, annotation)
    },
  },
})
```

`load` 与 `save` 必须同时提供。`Annotation` 使用以下核心字段：

- `id` / `client_id`：稳定标识；
- `annotation_type`：`highlight` 或 `note`；
- `chapter`、`cfi`、`quote_text`：章节与 EPUB 定位；
- `content`、`color`、`is_private`：笔记内容与展示属性。

不传 `annotation_callbacks` 时，阅读器自动按 `book_id`（缺省时按 `book_url`）隔离并保存到浏览器 `localStorage`。回调已经注入但执行失败时不会静默写入本地，避免宿主数据和本地数据产生不可见分叉。

“设置 → 笔记”是主开关，关闭时停止评论/标记加载、隐藏选区工具栏与已有标记，不删除数据，也不改变两个子选项：

- 加载章节段落评论：控制章评摘要、列表与正文图标。
- 选中后出现工具栏：控制选区工具栏，关闭后仍可查看已有划线笔记。

底部固定为目录、白天/夜晚、笔记、设置；统一笔记入口提供划线笔记、当前章评、本书评论（含登录与互动消息），听书移到顶部。主开关关闭时仍保留笔记入口并提示前往设置。

旧 `readerSettings` 自动迁移：`notes_enabled` 默认取旧 `show_comments || show_annotations`（缺失按开启），`show_comments` 保留，`show_selection_toolbar` 默认取旧 `show_annotations`。已存新字段优先；主开关重新开启恢复数据与子选项偏好。
