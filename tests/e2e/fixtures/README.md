`missing-toc/` 是故意只将封面写入 NCX 的 EPUB，正文包括有标题的段落和无标题的 div。用于验证缺目录时保存真实选区/CFI、刷新及开关后恢复。

`audiobook/` 是固定的两节 EPUB，保留 `audiobook.spec.js` 时间轴依赖的 href、fragment、段落次序和文本。原测试使用 demo 整卷（单节 HTML 约 2.5 MB），连续分页布局可令 display Promise 超过用例超时；此夹具将有声书 UI/定位行为与整卷排版性能分开，四项有声书断言保持不变。完整真实书籍的笔记验收另由 Talebook 集成脚本执行。
