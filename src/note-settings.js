// 迁移旧的划线/评论开关。早期版本有一个总开关 notes_enabled，现已去掉：
// 曾经关闭总开关的读者，迁移后两个具体开关都按关闭处理，保持原来「什么都不显示」的效果。
export function normalizeNoteSettings(saved = {}) {
  const legacyComments = saved.show_comments ?? true
  const legacyAnnotations = saved.show_annotations ?? true
  const enabled = saved.notes_enabled ?? true
  return {
    notes_settings_version: 3,
    show_comments: enabled && legacyComments,
    show_selection_toolbar: enabled && (saved.show_selection_toolbar ?? legacyAnnotations),
  }
}
