<template>
  <div class="panel-resizer" :class="{ dragging }" :style="edge_style"
    role="separator" aria-orientation="vertical" :aria-label="label" :aria-valuenow="Math.round(width)" :aria-valuemin="min" :aria-valuemax="max"
    tabindex="0" @pointerdown="start" @keydown="on_key" @dblclick="$emit('reset')">
    <span class="panel-resizer-knob" aria-hidden="true"></span>
  </div>
</template>

<script>
// 宽屏侧边栏的宽度调整条：9px 热区覆盖在面板真实边界上（不占布局），1px 分隔线与边界重合，中间是 8×24 的胶囊。
// 模板根节点前不能放注释：开发模式下注释会让根节点变成片段，$el 就不再是热区本身。
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
    // 热区以面板边界为中心：左侧面板的边界在 width 处，右侧面板的边界在 100% - width 处；分隔线画在热区内 4px。
    edge_style: function () {
      return { left: this.side === 'left' ? `calc(${this.width}px - 4px)` : `calc(100% - ${this.width}px - 4px)` }
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
      // 指针捕获：拖过正文 iframe、离开热区时也能持续收到移动事件。
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* noop */ }
      this.$el.addEventListener('pointermove', this.move)
      this.$el.addEventListener('pointerup', this.end)
      this.$el.addEventListener('pointercancel', this.end)
      document.body.classList.add('resizing-pane')
    },
    move: function (event) {
      if (!this.dragging) return
      // 左侧面板向右拖变宽（+1），右侧面板向左拖变宽（-1）。
      const direction = this.side === 'left' ? 1 : -1
      this.$emit('update:width', this.clamp(this.start_width + direction * (event.clientX - this.start_x)))
    },
    end: function () {
      if (!this.dragging) return
      this.stop()
      this.$emit('commit')
    },
    stop: function () {
      this.dragging = false
      this.$el?.removeEventListener?.('pointermove', this.move)
      this.$el?.removeEventListener?.('pointerup', this.end)
      this.$el?.removeEventListener?.('pointercancel', this.end)
      document.body.classList.remove('resizing-pane')
    },
    on_key: function (event) {
      // ArrowLeft / ArrowRight 每次移动边界 16px；Home 恢复默认宽度。
      let next = null
      if (event.key === 'ArrowLeft') next = this.width - KEY_STEP * (this.side === 'left' ? 1 : -1)
      else if (event.key === 'ArrowRight') next = this.width + KEY_STEP * (this.side === 'left' ? 1 : -1)
      else if (event.key !== 'Home') return
      // 阅读器在页面上监听方向键翻页，这里处理过的按键不再往外传。
      event.preventDefault()
      event.stopPropagation()
      if (next === null) return this.$emit('reset')
      this.$emit('update:width', this.clamp(next))
      this.$emit('commit')
    },
  },
}
</script>

<style scoped>
/* 覆盖在面板边界上的 9px 热区，不占布局。侧边栏的层级从 234 起，连续切换面板时 Vuetify 会逐层叠加；
   这里取 900，在面板与遮罩之上，仍低于底部导航、各类对话框与全屏评论页。 */
.panel-resizer {
  --split-line: rgba(var(--v-border-color), var(--v-border-opacity));
  position: fixed;
  top: 48px;
  bottom: 56px;
  z-index: 900;
  width: 9px;
  padding: 0;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  outline: none;
}
.panel-resizer::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 4px;
  width: 1px;
  background: var(--split-line);
}
.panel-resizer-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  box-sizing: border-box;
  width: 8px;
  height: 24px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--split-line);
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.45);
  pointer-events: none;
}
/* 两道握持刻度 */
.panel-resizer-knob::before {
  content: "";
  position: absolute;
  top: 7px;
  left: 1px;
  width: 4px;
  height: 1px;
  background: currentColor;
  box-shadow: 0 4px 0 currentColor;
}
.panel-resizer:hover::before,
.panel-resizer:focus-visible::before,
.panel-resizer.dragging::before {
  background: #2563eb;
}
.panel-resizer:hover .panel-resizer-knob,
.panel-resizer:focus-visible .panel-resizer-knob,
.panel-resizer.dragging .panel-resizer-knob {
  color: #ffffff;
  background: #2563eb;
  border-color: #2563eb;
}
@media (prefers-reduced-motion: no-preference) {
  .panel-resizer::before, .panel-resizer-knob { transition: background-color 0.12s, border-color 0.12s, color 0.12s; }
}
</style>

<style>
/* 拖动期间不选中文字，整页保持调整宽度的光标。 */
body.resizing-pane, body.resizing-pane * { cursor: col-resize !important; user-select: none !important; }
</style>
