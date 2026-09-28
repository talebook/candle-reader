# candle-reader
秉烛夜读

## 笔记入口开关（宿主接入）

「阅读笔记」入口是否出现由阅读器设置里的「笔记入口」决定（默认显示）。阅读器把当前值持续同步到文档根元素，宿主据此控制自己渲染的那份入口：

```html
<!-- 阅读器维护：on | off -->
<html data-candle-reader-notes-entry="off">
```

```css
html[data-candle-reader-notes-entry="off"] .your-notes-entry { display: none !important; }
```

偏好保存在 `localStorage.readerSettings.notes_entry`。宿主若要在阅读器挂载前就应用，避免入口先出现再消失，可在 `<head>` 里同步读一次：

```js
try {
  var saved = JSON.parse(localStorage.getItem('readerSettings') || '{}')
  if (saved.notes_entry === false) {
    document.documentElement.setAttribute('data-candle-reader-notes-entry', 'off')
  }
} catch (e) { /* localStorage 不可用时保持入口显示 */ }
```

宿主不需要实现开关本身：读者在阅读器设置面板里改，其它入口跟随该属性变化。
