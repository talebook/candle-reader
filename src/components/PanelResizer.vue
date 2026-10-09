<template>
  <!-- 宽屏侧边栏的宽度调整条：贴在面板内侧边缘，中间显示胶囊形把手；可拖动，也可用方向键调整。 -->
  <div class="panel-resizer" :class="[`panel-resizer--${side}`, { 'panel-resizer--dragging': dragging }]" :style="edge_style"
    role="separator" aria-orientation="vertical" :aria-label="label" :aria-valuenow="Math.round(width)" :aria-valuemin="min" :aria-valuemax="max"
    tabindex="0" @pointerdown="start" @keydown="on_key" @dblclick="$emit('reset')">
    <span class="panel-resizer-grip" aria-hidden="true"></span>
  </div>
</template>

<script>
const KEY_STEP = 16

export default {
  name: 'PanelResizer',
  props: {
    side: { type: String, default: 'right' }, // 面板所在的一侧：left 为目录，right 为评论和设置
    width: { type: Number, required: true },
    min: { type: Number, default: 260 },
    max: { type: Number, default: 720 },
    label: { type: String, default: '调整面板宽度' },
  },
  emits: ['update:width', 'commit', 'reset'],
  data: () => ({ dragging: false, start_x: 0, start_width: 0 }),
  computed: {
    edge_style: function () {
      return this.side === 'left' ? { left: `${this.width}px` } : { right: `${this.width}px` }
    },
  },
  beforeUnmount: function () {
    this.stop()
  },
  methods: {
    clamp: function (value) {
      return Math.min(this.max, Math.max(this.min, Math.round(value)))
    },
    start: function (event) {
      if (event.button !== 0) return
      event.preventDefault()
      this.dragging = true
      this.start_x = event.clientX
      this.start_width = this.width
      // 指针捕获：拖过正文 iframe 时也能持续收到移动事件。
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* noop */ }
      event.currentTarget.addEventListener('pointermove', this.move)
      event.currentTarget.addEventListener('pointerup', this.end)
      event.currentTarget.addEventListener('pointercancel', this.end)
      document.documentElement.classList.add('panel-resizing')
    },
    move: function (event) {
      if (!this.dragging) return
      const delta = event.clientX - this.start_x
      this.$emit('update:width', this.clamp(this.start_width + (this.side === 'left' ? delta : -delta)))
    },
    end: function (event) {
      if (!this.dragging) return
      this.stop(event?.currentTarget)
      this.$emit('commit')
    },
    stop: function (target = this.$el) {
      this.dragging = false
      target?.removeEventListener?.('pointermove', this.move)
      target?.removeEventListener?.('pointerup', this.end)
      target?.removeEventListener?.('pointercancel', this.end)
      document.documentElement.classList.remove('panel-resizing')
    },
    on_key: function (event) {
      // 方向键朝面板外侧加宽、朝正文一侧收窄；Home / End 直接到最窄 / 最宽。
      const grow = this.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
      const shrink = this.side === 'left' ? 'ArrowLeft' : 'ArrowRight'
      let next = null
      if (event.key === grow) next = this.width + KEY_STEP
      else if (event.key === shrink) next = this.width - KEY_STEP
      else if (event.key === 'Home') next = this.min
      else if (event.key === 'End') next = this.max
      if (next === null) return
      // 阅读器在页面上监听方向键翻页，这里处理过的按键不再往外传。
      event.preventDefault()
      event.stopPropagation()
      this.$emit('update:width', this.clamp(next))
      this.$emit('commit')
    },
  },
}
</script>

<style scoped>
/* 覆盖面板边框的一条细长热区。侧边栏的层级从 234 起，连续切换面板时 Vuetify 会逐层叠加；这里取 900，仍低于底部导航、各类对话框与全屏评论页。 */
.panel-resizer {
  position: fixed;
  top: 48px;
  bottom: 56px;
  z-index: 900;
  width: 16px;
  margin: 0 -8px;
  display: grid;
  place-items: center;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}
.panel-resizer-grip {
  width: 6px;
  height: 40px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.28);
  box-shadow: 0 0 0 1px rgb(var(--v-theme-surface));
  transition: background-color 0.15s, height 0.15s;
}
.panel-resizer:hover .panel-resizer-grip,
.panel-resizer--dragging .panel-resizer-grip { height: 56px; background: rgba(var(--v-theme-on-surface), 0.5); }
.panel-resizer:focus-visible .panel-resizer-grip { background: rgb(var(--v-theme-primary)); outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .panel-resizer-grip { transition: none; }
}
</style>

<style>
/* 拖动期间不选中文字，整页保持调整宽度的光标。 */
html.panel-resizing, html.panel-resizing * { cursor: col-resize !important; user-select: none !important; }
</style>
