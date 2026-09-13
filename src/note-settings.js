// Migrate the two legacy feature switches once; keep child preferences when disabled.
export function normalizeNoteSettings(saved = {}) {
  const legacyComments = saved.show_comments ?? true
  const legacyAnnotations = saved.show_annotations ?? true
  return {
    notes_settings_version: 2,
    notes_enabled: saved.notes_enabled ?? (legacyComments || legacyAnnotations),
    show_comments: legacyComments,
    show_selection_toolbar: saved.show_selection_toolbar ?? legacyAnnotations,
  }
}
