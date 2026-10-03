<template>
  <div ref="scroller" class="comment-list" :aria-busy="String(state.loading)" @scroll.passive="maybe_load_more">
    <div v-if="state.error && !state.items.length" class="comment-state" role="alert">
      <v-icon size="30">mdi-alert-circle-outline</v-icon>
      <p>评论暂时没能加载</p>
      <p class="comment-state-hint">{{ state.error }}</p>
      <v-btn variant="tonal" @click="$emit('retry')">重新加载</v-btn>
    </div>
    <div v-else-if="state.loading && !state.items.length" class="comment-state" role="status">
      <v-progress-circular indeterminate size="28" color="primary"></v-progress-circular>
      <p>正在加载评论…</p>
    </div>
    <div v-else-if="!state.items.length" class="comment-state">
      <v-icon size="30">mdi-comment-text-outline</v-icon>
      <p>{{ empty }}</p>
      <slot name="empty"></slot>
    </div>
    <template v-else>
      <comment-item v-for="record in state.items" :key="record.id" class="comment-list-item" :record="record" clickable :tags="tags"
        @open="$emit('open', $event)" @reply="$emit('open', $event)" @edit="$emit('edit', $event)" @remove="$emit('remove', $event)"
        @vote="(record, value) => $emit('vote', record, value)"></comment-item>
      <div class="comment-load-status" role="status">
        <template v-if="state.error">加载失败 <button type="button" class="comment-retry" @click="$emit('retry')">重试</button></template>
        <template v-else-if="state.loading">正在加载更多评论…</template>
        <template v-else-if="state.has_more">继续下滑，加载更多评论</template>
        <template v-else>已显示全部评论</template>
      </div>
    </template>
  </div>
</template>

<script>
import CommentItem from './CommentItem.vue'

export default {
  name: 'CommentList',
  components: { CommentItem },
  emits: ['more', 'retry', 'open', 'edit', 'remove', 'vote'],
  props: {
    // { items, has_more, loading, error }
    state: { type: Object, required: true },
    empty: { type: String, default: '这里还没有公开评论' },
    tags: { type: Boolean, default: false },
  },
  watch: {
    // 首屏不足一页高度时没有滚动事件，加载完成后主动补一次检查。
    'state.loading': function (loading) { if (!loading) this.$nextTick(this.maybe_load_more) },
  },
  methods: {
    maybe_load_more: function () {
      const el = this.$refs.scroller
      if (!el || !el.clientHeight || this.state.loading || this.state.error || !this.state.has_more) return
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= 48) this.$emit('more')
    },
    scroll_to_top: function () {
      if (this.$refs.scroller) this.$refs.scroller.scrollTop = 0
    },
  },
}
</script>

<style scoped>
.comment-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 20px; }
.comment-list-item + .comment-list-item { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.comment-state { padding: 40px 12px; text-align: center; font-size: 14px; color: rgba(var(--v-theme-on-surface), 0.7); }
.comment-state p { margin: 8px 0; }
.comment-state-hint { font-size: 12px; }
.comment-load-status { padding: 18px 0; text-align: center; font-size: 12px; color: rgba(var(--v-theme-on-surface), 0.7); }
.comment-retry { color: rgb(var(--v-theme-primary)); padding: 4px 8px; }
</style>
