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

用户可在“设置 → 划线笔记”关闭入口、选区动作和已渲染标记；关闭不会删除已有数据。
