<template>
  <!-- 阅读中的评论抽屉：默认本章评论，也承载从选区或段尾气泡进入的本段评论。 -->
  <section ref="drawer" class="reader-comments-drawer" aria-label="评论">
    <div class="rc-grip" @pointerdown="on_drag_start" @pointermove="on_drag_move" @pointerup="on_drag_end" @pointercancel="on_drag_cancel">
      <div class="rc-handle" aria-hidden="true"></div>
      <header class="rc-head">
        <strong>{{ drawer.scope === 'paragraph' ? '本段评论' : '本章评论' }}</strong>
        <button ref="moreEntry" type="button" class="rc-more" @click="open_page">查看更多评论 <v-icon size="20" aria-hidden="true">mdi-chevron-right</v-icon></button>
      </header>
    </div>
    <comment-list ref="drawerList" :state="drawer" @more="load(drawer)" @retry="retry(drawer)" @login="$emit('login')" @open="open_detail"
      @edit="$emit('edit', $event)" @remove="ask_remove" @vote="vote"></comment-list>
    <footer class="rc-footer">
      <v-btn block color="primary" variant="flat" prepend-icon="mdi-plus" @click="write(drawer)">写评论</v-btn>
    </footer>
  </section>

  <!-- 完整评论页：独立页面，占满整个内容区域，不保留阅读菜单或正文。 -->
  <v-dialog :model-value="page_open" class="rc-standalone" fullscreen :scrim="false" transition="slide-x-reverse-transition"
    aria-label="完整评论页" @update:model-value="$event || back()">
    <section class="rc-page">
      <nav class="rc-tabs" aria-label="查看范围">
        <button type="button" class="rc-back" aria-label="返回评论弹窗" @click="back"><v-icon aria-hidden="true">mdi-chevron-left</v-icon></button>
        <button v-for="tab in tabs" :key="tab.scope" type="button" class="rc-tab" :class="{ 'rc-tab--active': page.scope === tab.scope }"
          :aria-pressed="String(page.scope === tab.scope)" @click="set_page_scope(tab.scope)">{{ tab.label }}</button>
      </nav>
      <div class="rc-page-body">
        <div v-if="page.scope === 'mine' && !user" class="rc-login">
          <p>登录后查看你的划线和评论</p>
          <v-btn variant="tonal" @click="$emit('login')">去登录</v-btn>
        </div>
        <comment-list v-else ref="pageList" :state="page" :tags="page.scope === 'mine'"
          :empty="page.scope === 'mine' ? '这里还没有你的记录' : '这里还没有公开评论'" @more="load(page)" @retry="retry(page)" @login="$emit('login')"
          @open="open_detail" @edit="$emit('edit', $event)" @remove="ask_remove" @vote="vote"></comment-list>
      </div>
      <footer class="rc-footer">
        <v-btn block color="primary" variant="flat" prepend-icon="mdi-plus" @click="write(page)">写评论</v-btn>
      </footer>
    </section>
  </v-dialog>

  <!-- 评论详情页：主评论 + 回复。第一层回复不缩进，第二层及之后统一缩进一级。 -->
  <v-dialog :model-value="detail_open" class="rc-standalone" fullscreen :scrim="false" transition="slide-x-reverse-transition"
    aria-label="评论详情" @update:model-value="$event || back()">
    <section v-if="detail.root" class="rc-page">
      <nav class="rc-detail-nav">
        <button type="button" class="rc-back" aria-label="返回评论列表" @click="back"><v-icon aria-hidden="true">mdi-chevron-left</v-icon></button>
        <strong>评论详情</strong>
      </nav>
      <div ref="detailBody" class="rc-page-body rc-detail-body" @scroll.passive="maybe_load_replies">
        <comment-item :record="detail.root" :tags="root_private" @edit="$emit('edit', $event)" @remove="ask_remove"
          @vote="vote" @reply="reply_to(null)"></comment-item>
        <div class="rc-replies-title">{{ detail.root.reply_count || 0 }} 条回复{{ root_private ? ' · 仅你可见' : '' }}</div>
        <div v-if="replies.error && !replies.items.length" class="rc-replies-state" role="alert">
          回复暂时没能加载 <button type="button" class="rc-text-button" @click="load_replies(true)">重试</button>
        </div>
        <div v-else-if="!replies.items.length && !replies.loading" class="rc-replies-state">还没有回复，来说点什么吧</div>
        <div v-for="thread in threads" :key="thread.first.id" class="rc-thread">
          <comment-item :record="thread.first" :readonly="root_private" @edit="edit_reply" @remove="ask_remove" @vote="vote" @reply="reply_to"></comment-item>
          <div v-if="thread.children.length" class="rc-thread-children">
            <comment-item v-for="reply in thread.children" :key="reply.id" :record="reply" :readonly="root_private"
              @edit="edit_reply" @remove="ask_remove" @vote="vote" @reply="reply_to"></comment-item>
          </div>
        </div>
        <div v-if="replies.items.length" class="rc-replies-state" role="status">
          <template v-if="replies.error">加载失败 <button type="button" class="rc-text-button" @click="load_replies()">重试</button></template>
          <template v-else-if="replies.loading">正在加载回复…</template>
          <template v-else-if="!replies.has_more">已显示全部回复</template>
        </div>
      </div>
      <footer v-if="!root_private" class="rc-footer">
        <form class="rc-reply-box" @submit.prevent="send_reply">
          <v-textarea ref="replyInput" v-model="detail.draft" class="rc-reply-input" aria-label="回复内容" :placeholder="reply_placeholder"
            variant="outlined" density="compact" rows="1" max-rows="4" auto-grow hide-details :readonly="detail.sending"></v-textarea>
          <v-btn v-if="detail.to || detail.edit" variant="text" :disabled="detail.sending" @click="reset_composer">取消</v-btn>
          <v-btn type="submit" color="primary" variant="flat" :loading="detail.sending">{{ detail.edit ? '保存' : '发送' }}</v-btn>
        </form>
      </footer>
    </section>
  </v-dialog>

  <v-dialog v-model="removing.open" class="rc-above-standalone" max-width="360" :persistent="removing.busy" aria-labelledby="rc-remove-title">
    <v-card>
      <v-card-title id="rc-remove-title" class="text-subtitle-1">删除后无法恢复</v-card-title>
      <v-card-text>{{ remove_message }}</v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="removing.busy" @click="removing.open = false">取消</v-btn>
        <v-btn color="error" variant="flat" :loading="removing.busy" @click="confirm_remove">删除</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { createClientId } from '@/annotations'
import CommentItem from './CommentItem.vue'
import CommentList from './CommentList.vue'

const PAGE_SIZE = 20
const list_state = scope => ({ scope, paragraph_cfi: '', items: [], cursor: null, has_more: false, loading: false, error: '', need_login: false, request: 0 })

export default {
  name: 'ReaderComments',
  components: { CommentItem, CommentList },
  emits: ['write', 'edit', 'login', 'changed', 'feedback', 'close'],
  props: {
    repository: { type: Object, default: null },
    user: { type: Object, default: null },
    chapter: { type: String, default: '' },
    // 抽屉是否展开；收起时不为章节切换发请求。
    active: { type: Boolean, default: false },
  },
  data: () => ({
    drawer: list_state('chapter'),
    page: list_state('chapter'),
    replies: list_state('replies'),
    detail: { root: null, to: null, edit: null, draft: '', sending: false },
    // 已进入的独立页面栈（'page' / 'detail'），与浏览器历史一一对应。
    nav: [],
    removing: { open: false, busy: false, record: null },
    voting: new Set(),
    drag: null,
    tabs: [
      { scope: 'chapter', label: '本章评论' },
      { scope: 'book', label: '全书评论' },
      { scope: 'mine', label: '我的' },
    ],
  }),
  computed: {
    page_open: function () { return this.nav.includes('page') },
    detail_open: function () { return this.nav.includes('detail') && Boolean(this.detail.root) },
    root_private: function () { return this.detail.root?.is_private !== false },
    reply_placeholder: function () {
      if (this.detail.edit) return '修改回复'
      return `回复 ${(this.detail.to || this.detail.root)?.author_name || '书友'}`
    },
    threads: function () {
      const items = this.replies.items
      const firsts = items.filter(reply => !reply.thread_id || !items.some(item => item.id === reply.thread_id))
      return firsts.map(first => ({ first, children: items.filter(reply => reply.thread_id === first.id) }))
    },
    remove_message: function () {
      const record = this.removing.record
      if (!record) return ''
      const count = record.root_id ? this.replies.items.filter(reply => reply.thread_id === record.id).length : record.reply_count || 0
      const target = record.root_id ? '回复' : '评论'
      return count ? `这条${target}下的 ${count} 条回复也会一并删除。确定删除吗？` : `确定删除这条${target}吗？`
    },
  },
  watch: {
    chapter: function () {
      if (this.active && this.drawer.scope === 'chapter') this.load(this.drawer, true)
    },
    user: function () {
      // 登录后重新加载：之前因为需要登录而没有内容的列表，以及「我的」。
      if (this.drawer.need_login) this.load(this.drawer, true)
      if (this.page_open && (this.page.scope === 'mine' || this.page.need_login)) this.load(this.page, true)
    },
  },
  mounted: function () {
    window.addEventListener('popstate', this.on_popstate)
  },
  beforeUnmount: function () {
    window.removeEventListener('popstate', this.on_popstate)
  },
  methods: {
    // ---- 列表 ----
    show: function (scope, paragraphCfi = '') {
      this.drawer.scope = scope
      this.drawer.paragraph_cfi = paragraphCfi
      this.$refs.drawerList?.scroll_to_top()
      return this.load(this.drawer, true)
    },
    reload: function () {
      this.load(this.drawer, true)
      if (this.page_open) this.load(this.page, true)
    },
    retry: function (state) {
      return this.load(state, !state.items.length)
    },
    load: async function (state, reset = false) {
      if (!this.repository) return
      if (reset) {
        state.request++
        Object.assign(state, { items: [], cursor: null, has_more: false, error: '', need_login: false })
      } else if (state.loading || (!state.has_more && !state.error)) return
      const request = state.request
      state.loading = true
      state.error = ''
      try {
        const query = state === this.replies
          ? { root_id: this.detail.root.id, cursor: state.cursor, limit: PAGE_SIZE }
          : { scope: state.scope, chapter: this.chapter, paragraph_cfi: state.paragraph_cfi, cursor: state.cursor, limit: PAGE_SIZE }
        const result = await (state === this.replies ? this.repository.replies(query) : this.repository.list(query))
        // 切换范围后迟到的响应不能混入新范围。
        if (request !== state.request) return
        const known = new Set(state.items.map(item => item.id))
        state.items.push(...result.items.filter(item => !known.has(item.id)))
        state.cursor = result.next_cursor
        state.has_more = result.has_more
      } catch (error) {
        if (request !== state.request) return
        // 宿主以 code 为 need_login 的错误拒绝时，表示需要登录才能查看，显示登录提示而不是错误。
        state.need_login = error?.code === 'need_login'
        state.error = error.message || '请稍后重试'
      } finally {
        if (request === state.request) state.loading = false
      }
    },
    set_page_scope: function (scope) {
      if (this.page.scope === scope) return
      this.page.scope = scope
      this.$refs.pageList?.scroll_to_top()
      if (scope !== 'mine' || this.user) this.load(this.page, true)
    },
    write: function (state) {
      if (!this.user) return this.$emit('login')
      this.$emit('write', { scope: state.scope, paragraph_cfi: state.paragraph_cfi })
    },
    copies: function (id) {
      const all = [...this.drawer.items, ...this.page.items, ...this.replies.items]
      if (this.detail.root) all.push(this.detail.root)
      return all.filter(item => item.id === id)
    },
    patch: function (id, fields) {
      this.copies(id).forEach(item => Object.assign(item, fields))
    },
    // 编辑框保存成功后由阅读器调用：就地更新已有记录，新记录则刷新列表。
    apply_saved: function (record) {
      if (this.copies(record.id).length) this.patch(record.id, record)
      this.reload()
    },

    // ---- 独立页面与浏览器返回 ----
    push: function (name) {
      this.nav.push(name)
      history.pushState({ ...history.state, candle_comments: this.nav.length }, '')
    },
    back: function () {
      if (this.nav.length) history.back()
    },
    on_popstate: function (event) {
      const depth = event.state?.candle_comments || 0
      while (this.nav.length > depth) this.leave(this.nav.pop())
    },
    leave: function (name) {
      if (name === 'detail') {
        this.replies.request++
        this.reset_composer()
        const id = this.detail.root?.id
        this.detail.root = null
        // 抽屉和完整评论页可能同时列着这条评论，焦点回到最上层那一个。
        this.$nextTick(() => Array.from(document.querySelectorAll(`.v-overlay--active [data-comment="${CSS.escape(String(id))}"] .comment-reply`)).pop()?.focus())
      } else {
        this.$nextTick(() => this.$refs.moreEntry?.focus())
      }
    },
    // 抽屉被收起时一并退出独立页面，历史记录同步回退。
    close_pages: function () {
      if (this.nav.length) history.go(-this.nav.length)
    },
    open_page: function () {
      this.page.scope = 'chapter'
      this.push('page')
      this.load(this.page, true)
    },
    open_detail: function (record) {
      this.detail.root = record
      this.reset_composer()
      this.push('detail')
      this.load_replies(true)
    },
    load_replies: function (reset = false) {
      return this.load(this.replies, reset)
    },
    maybe_load_replies: function () {
      const el = this.$refs.detailBody
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight <= 48) this.load_replies()
    },

    // ---- 回复 ----
    reset_composer: function () {
      Object.assign(this.detail, { to: null, edit: null, draft: '' })
    },
    focus_composer: function () {
      this.$nextTick(() => this.$refs.replyInput?.focus())
    },
    reply_to: function (reply) {
      if (!this.user) return this.$emit('login')
      Object.assign(this.detail, { to: reply, edit: null, draft: this.detail.edit ? '' : this.detail.draft })
      this.focus_composer()
    },
    edit_reply: function (reply) {
      Object.assign(this.detail, { to: null, edit: reply, draft: reply.content })
      this.focus_composer()
    },
    send_reply: async function () {
      if (!this.user) return this.$emit('login')
      const content = this.detail.draft.trim()
      const root = this.detail.root
      if (!content || this.detail.sending) return this.focus_composer()
      const editing = this.detail.edit
      this.detail.sending = true
      try {
        const saved = await this.repository.save(editing
          ? { id: editing.id, client_id: editing.client_id, root_id: root.id, content }
          : { client_id: createClientId(), root_id: root.id, reply_to_id: this.detail.to?.id || null, content })
        if (this.detail.root !== root) return
        if (editing) Object.assign(editing, saved)
        else {
          this.replies.items.push(saved)
          this.patch(root.id, { reply_count: (root.reply_count || 0) + 1 })
        }
        this.reset_composer()
      } catch (error) {
        this.$emit('feedback', `回复失败：${error.message || '请稍后重试'}`, true)
      } finally {
        this.detail.sending = false
      }
    },

    // ---- 赞踩：互斥，再点一次取消；失败恢复到操作前 ----
    vote: async function (record, value) {
      if (!this.user) return this.$emit('login')
      if (this.voting.has(record.id)) return
      const before = { like_count: record.like_count || 0, dislike_count: record.dislike_count || 0, user_vote: record.user_vote || 0 }
      const next = before.user_vote === value ? 0 : value
      this.voting.add(record.id)
      this.patch(record.id, {
        user_vote: next,
        like_count: before.like_count - (before.user_vote === 1) + (next === 1),
        dislike_count: before.dislike_count - (before.user_vote === -1) + (next === -1),
      })
      try {
        const result = await this.repository.vote({ id: record.id, value: next })
        this.patch(record.id, { like_count: result.like_count, dislike_count: result.dislike_count, user_vote: result.user_vote })
      } catch (error) {
        this.patch(record.id, before)
        this.$emit('feedback', `操作失败：${error.message || '请稍后重试'}`, true)
      } finally {
        this.voting.delete(record.id)
      }
    },

    // ---- 删除：真删除，主评论连同全部回复，第一层回复连同其下回复 ----
    ask_remove: function (record) {
      Object.assign(this.removing, { open: true, busy: false, record })
    },
    confirm_remove: async function () {
      const record = this.removing.record
      this.removing.busy = true
      try {
        await this.repository.remove({ id: record.id })
        if (record.root_id) {
          const before = this.replies.items.length
          this.replies.items = this.replies.items.filter(reply => reply.id !== record.id && reply.thread_id !== record.id)
          const root = this.detail.root
          if (root) this.patch(root.id, { reply_count: Math.max(0, (root.reply_count || 0) - (before - this.replies.items.length)) })
          if (this.detail.to?.id === record.id || this.detail.edit?.id === record.id) this.reset_composer()
        } else {
          for (const state of [this.drawer, this.page]) state.items = state.items.filter(item => item.id !== record.id)
          if (this.detail.root?.id === record.id) this.back()
          this.$emit('changed', record)
        }
        this.removing.open = false
        this.$emit('feedback', '已删除')
      } catch (error) {
        this.$emit('feedback', `删除失败：${error.message || '请稍后重试'}`, true)
      } finally {
        this.removing.busy = false
      }
    },

    // ---- 移动端向下拖拽收起抽屉 ----
    sheet: function () { return this.$refs.drawer?.closest('.v-overlay__content') },
    on_drag_start: function (event) {
      if (event.button !== 0 || event.target.closest('button') || window.innerWidth >= 850) return
      this.drag = { y: event.clientY, id: event.pointerId }
      event.currentTarget.setPointerCapture(event.pointerId)
      this.sheet().style.transition = 'none'
    },
    on_drag_move: function (event) {
      if (!this.drag || event.pointerId !== this.drag.id) return
      this.sheet().style.transform = `translateY(${Math.max(0, event.clientY - this.drag.y)}px)`
    },
    on_drag_end: function (event) {
      if (!this.drag || event.pointerId !== this.drag.id) return
      const distance = event.clientY - this.drag.y
      this.on_drag_cancel()
      if (distance >= 72) this.$emit('close')
    },
    on_drag_cancel: function () {
      this.drag = null
      const sheet = this.sheet()
      if (sheet) { sheet.style.transition = ''; sheet.style.transform = '' }
    },
  },
}
</script>

<style scoped>
.reader-comments-drawer { display: flex; flex-direction: column; height: 100%; min-height: 0; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); border-radius: 22px 22px 0 0; overflow: hidden; }
.rc-grip { flex: 0 0 auto; touch-action: none; user-select: none; }
.rc-handle { width: 36px; height: 4px; margin: 10px auto 0; border-radius: 4px; background: rgba(var(--v-theme-on-surface), 0.24); }
.rc-head { display: flex; align-items: center; justify-content: space-between; margin: 4px 20px 0; padding: 8px 0; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); font-size: 14px; }
.rc-head strong { font-weight: 500; }
.rc-more { display: inline-flex; align-items: center; min-height: 36px; padding-left: 8px; border-radius: 6px; font-size: 13px; color: rgb(var(--v-theme-on-surface)); color: color-mix(in srgb, rgb(var(--v-theme-primary)) 60%, rgb(var(--v-theme-on-surface))); }
.rc-footer { flex: 0 0 auto; padding: 12px 20px; padding-bottom: max(12px, env(safe-area-inset-bottom)); border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); background: rgb(var(--v-theme-surface)); }
.rc-page { display: flex; flex-direction: column; height: 100%; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); padding-top: env(safe-area-inset-top); }
.rc-tabs, .rc-detail-nav { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.rc-detail-nav { min-height: 48px; font-size: 15px; }
.rc-back { flex: 0 0 40px; display: grid; place-items: center; width: 40px; height: 44px; border-radius: 8px; }
.rc-tab { flex: 1 1 0; min-height: 48px; border-bottom: 2px solid transparent; font-size: 14px; white-space: nowrap; color: rgba(var(--v-theme-on-surface), 0.7); }
.rc-tab--active { color: rgb(var(--v-theme-on-surface)); color: color-mix(in srgb, rgb(var(--v-theme-primary)) 60%, rgb(var(--v-theme-on-surface))); border-color: rgb(var(--v-theme-primary)); font-weight: 600; }
.rc-page-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; width: 100%; max-width: 820px; margin: 0 auto; }
.rc-detail-body { display: block; overflow-y: auto; overscroll-behavior: contain; padding: 0 20px; }
.rc-login { padding: 48px 20px; text-align: center; font-size: 14px; color: rgba(var(--v-theme-on-surface), 0.7); }
.rc-login p { margin-bottom: 16px; }
.rc-replies-title { padding: 12px 0 0; border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); font-size: 12px; color: rgba(var(--v-theme-on-surface), 0.7); }
.rc-replies-state { padding: 18px 0; text-align: center; font-size: 12px; color: rgba(var(--v-theme-on-surface), 0.7); }
.rc-thread + .rc-thread { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.rc-thread-children { margin: 0 0 8px 20px; padding-left: 12px; border-left: 2px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.rc-thread-children .comment-item { padding: 10px 0; }
.rc-thread-children .comment-item + .comment-item { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.rc-text-button { padding: 4px 8px; color: rgb(var(--v-theme-on-surface)); color: color-mix(in srgb, rgb(var(--v-theme-primary)) 60%, rgb(var(--v-theme-on-surface))); }
.rc-reply-box { display: flex; align-items: flex-end; gap: 8px; width: 100%; max-width: 780px; margin: 0 auto; }
.rc-reply-input { flex: 1 1 auto; min-width: 0; }
.rc-more:focus-visible, .rc-back:focus-visible, .rc-tab:focus-visible, .rc-text-button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
@media (min-width: 850px) {
  .reader-comments-drawer { border-radius: 0; }
  .rc-handle { display: none; }
  .rc-grip { touch-action: auto; }
  .rc-head { margin-top: 10px; }
}
</style>

<style>
/* 独立页面要盖住顶部栏与底部菜单（Vuetify 给嵌套浮层的层级只比抽屉高一档，这里显式抬高）。 */
.v-overlay.rc-standalone { z-index: 2600 !important; }
.v-overlay.rc-above-standalone { z-index: 2700 !important; }
</style>
