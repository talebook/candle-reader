<template>
  <article class="comment-item" :class="{ 'comment-item--link': clickable }" :data-comment="record.id"
    :data-mine="String(Boolean(record.is_mine))" @click="on_click">
    <div class="comment-meta">
      <span class="comment-author">{{ record.author_name || '书友' }}</span>
      <span v-if="tags && record.annotation_type === 'highlight'" class="comment-tag">划线</span>
      <span v-if="tags && record.annotation_type === 'book_comment'" class="comment-tag">整书评论</span>
      <time class="comment-time">{{ time_text }}</time>
    </div>
    <p class="comment-content">
      <span v-if="record.reply_to_name" class="comment-reply-to">回复 {{ record.reply_to_name }}：</span>{{ record.content || record.quote_text }}
    </p>
    <div v-if="interactive || private_replies || is_private || manageable" class="comment-footer">
      <div v-if="interactive" class="comment-actions">
        <button type="button" class="comment-vote" :aria-pressed="String(record.user_vote === 1)" :aria-label="`赞 ${record.like_count || 0}`"
          @click.stop="$emit('vote', record, 1)">
          <v-icon size="16" aria-hidden="true">{{ record.user_vote === 1 ? 'mdi-thumb-up' : 'mdi-thumb-up-outline' }}</v-icon>{{ record.like_count || 0 }}
        </button>
        <button type="button" class="comment-vote" :aria-pressed="String(record.user_vote === -1)" :aria-label="`踩 ${record.dislike_count || 0}`"
          @click.stop="$emit('vote', record, -1)">
          <v-icon size="16" aria-hidden="true">{{ record.user_vote === -1 ? 'mdi-thumb-down' : 'mdi-thumb-down-outline' }}</v-icon>{{ record.dislike_count || 0 }}
        </button>
        <button type="button" class="comment-reply" @click.stop="$emit('reply', record)">{{ reply_text }}</button>
      </div>
      <div v-else-if="private_replies" class="comment-actions">
        <button type="button" class="comment-reply" @click.stop="$emit('reply', record)">{{ record.reply_count }} 条回复 · 仅你可见</button>
      </div>
      <!-- 右下角：私密标记（含划线，只有作者自己看得到），以及自己记录的修改、删除。 -->
      <div v-if="is_private || manageable" class="comment-end">
        <span v-if="is_private" class="comment-private">私密</span>
        <template v-if="manageable">
          <button v-if="record.annotation_type !== 'highlight'" type="button" class="comment-manage" @click.stop="$emit('edit', record)">修改</button>
          <button type="button" class="comment-manage" @click.stop="$emit('remove', record)">删除</button>
        </template>
      </div>
    </div>
  </article>
</template>

<script>
export default {
  name: 'CommentItem',
  emits: ['open', 'edit', 'remove', 'vote', 'reply'],
  props: {
    record: { type: Object, required: true },
    // 列表中的主评论整条可点，进入评论详情页。
    clickable: { type: Boolean, default: false },
    // 「我的」与私密详情里显示类型标签（划线、整书评论）；私密标记不受此限，总在右下角显示。
    tags: { type: Boolean, default: false },
    // 主评论转为私密后，其下回复只读。
    readonly: { type: Boolean, default: false },
  },
  computed: {
    is_reply: function () { return Boolean(this.record.root_id) },
    is_private: function () { return !this.is_reply && this.record.is_private !== false },
    interactive: function () { return !this.readonly && !this.is_private },
    manageable: function () { return Boolean(this.record.is_mine) && !this.readonly },
    private_replies: function () { return this.clickable && this.is_private && this.record.reply_count > 0 },
    reply_text: function () { return this.is_reply ? '回复' : `回复 ${this.record.reply_count || 0}` },
    time_text: function () {
      const value = this.record.created_at
      const date = value ? new Date(value) : null
      if (!date || Number.isNaN(date.getTime())) return value || ''
      const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes} 分钟前`
      if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`
      if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / 60 / 24)} 天前`
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    },
  },
  methods: {
    on_click: function () {
      // 正在选中文字时不跳转。
      if (this.clickable && !String(window.getSelection())) this.$emit('open', this.record)
    },
  },
}
</script>

<style scoped>
.comment-item { padding: 14px 0; }
.comment-item--link { cursor: pointer; }
.comment-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 1.5; color: rgba(var(--v-theme-on-surface), 0.7); }
.comment-time { margin-left: auto; white-space: nowrap; }
.comment-tag { padding: 0 6px; border-radius: 4px; font-size: 11px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); }
.comment-content { margin: 6px 0 0; font-size: 14px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; color: rgb(var(--v-theme-on-surface)); }
.comment-reply-to { color: rgba(var(--v-theme-on-surface), 0.7); }
.comment-manage { min-height: 32px; padding: 0 8px; border-radius: 6px; font-size: 13px; color: rgb(var(--v-theme-on-surface)); color: color-mix(in srgb, rgb(var(--v-theme-primary)) 60%, rgb(var(--v-theme-on-surface))); white-space: nowrap; }
.comment-footer { display: flex; align-items: center; gap: 8px; margin-top: 4px; min-height: 24px; }
.comment-end { display: flex; align-items: center; gap: 4px; margin: 0 -8px 0 auto; }
.comment-private { padding: 0 6px; border-radius: 4px; font-size: 12px; line-height: 20px; white-space: nowrap; color: rgba(var(--v-theme-on-surface), 0.7); background: rgba(var(--v-theme-on-surface), 0.08); }
.comment-actions { display: flex; align-items: center; gap: 4px; margin: 0 0 0 -8px; font-size: 13px; color: rgba(var(--v-theme-on-surface), 0.7); }
.comment-actions button { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 8px; border-radius: 6px; }
.comment-actions button[aria-pressed=true] { color: rgb(var(--v-theme-on-surface)); color: color-mix(in srgb, rgb(var(--v-theme-primary)) 60%, rgb(var(--v-theme-on-surface))); font-weight: 600; }
.comment-item button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
@media (hover: hover) { .comment-actions button:hover, .comment-manage:hover { background: rgba(var(--v-theme-on-surface), 0.08); } }
</style>
