<template>
  <v-card class="annotation-panel" rounded="t-lg" :aria-busy="String(loading)">
    <v-progress-linear v-if="loading" aria-label="正在加载笔记" indeterminate></v-progress-linear>
    <v-alert v-else-if="error" class="ma-3" type="error" variant="tonal" density="compact">{{ error }}。请刷新笔记重试。</v-alert>
    <v-card-text v-else-if="annotations.length === 0" class="annotation-empty text-center">
      <v-icon size="32">mdi-notebook-outline</v-icon>
      <div class="mt-2">还没有划线或笔记</div>
      <div v-if="toolbarEnabled" class="text-medium-emphasis mt-1">在正文中选择文字即可开始。</div>
      <template v-else>
        <div class="text-medium-emphasis mt-1">选区工具栏已关闭，开启后即可添加划线或笔记。</div>
        <v-btn class="mt-3" variant="tonal" @click="$emit('open-settings')">前往设置开启工具栏</v-btn>
      </template>
    </v-card-text>
    <v-list v-else aria-label="本书笔记列表" lines="three">
      <v-list-item
        v-for="annotation in annotations"
        :key="annotation.id || annotation.client_id"
        class="annotation-item"
        :link="Boolean(annotation.cfi)"
        @click="annotation.cfi && $emit('locate', annotation)"
      >
        <template v-slot:prepend>
          <v-icon :color="annotation.annotation_type === 'note' ? 'blue' : 'amber-darken-2'">
            {{ annotation.annotation_type === 'note' ? 'mdi-note-text-outline' : 'mdi-format-color-highlight' }}
          </v-icon>
        </template>
        <v-list-item-title>{{ annotation.chapter || '未命名章节' }}</v-list-item-title>
        <v-list-item-subtitle v-if="annotation.quote_text" class="annotation-quote">{{ annotation.quote_text }}</v-list-item-subtitle>
        <div v-if="annotation.content" class="annotation-content mt-1">{{ annotation.content }}</div>
        <template v-slot:append>
          <v-icon v-if="annotation.cfi" size="small">mdi-chevron-right</v-icon>
          <span v-else class="annotation-location-hint text-medium-emphasis">仅章节定位</span>
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script>
export default {
  name: 'BookAnnotations',
  emits: ['locate', 'open-settings'],
  props: {
    toolbarEnabled: { type: Boolean, default: true },
    annotations: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
  },
}
</script>

<style scoped>
.annotation-panel { min-height: 220px; max-height: 82vh; overflow-y: auto; }
.annotation-empty { padding-block: 36px; }
.annotation-item + .annotation-item { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.annotation-quote { white-space: normal; color: rgb(var(--v-theme-on-surface)); opacity: 1; }
.annotation-content { color: rgb(var(--v-theme-on-surface)); font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.annotation-location-hint { font-size: 12px; white-space: nowrap; }
</style>
