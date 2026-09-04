<template>
  <v-card class="annotation-panel" rounded="t-lg" :aria-busy="String(loading)">
    <v-toolbar density="compact">
      <v-toolbar-title id="annotation-panel-title">阅读笔记</v-toolbar-title>
      <template v-slot:append>
        <v-btn icon="mdi-refresh" title="刷新笔记" aria-label="刷新笔记" :loading="loading" @click="$emit('refresh')"></v-btn>
        <v-btn icon="mdi-close" title="关闭笔记" aria-label="关闭笔记" @click="$emit('close')"></v-btn>
      </template>
    </v-toolbar>

    <v-progress-linear v-if="loading" indeterminate></v-progress-linear>
    <v-alert v-if="error" class="ma-3" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
    <v-card-text v-if="!loading && annotations.length === 0" class="annotation-empty text-center">
      <v-icon size="32">mdi-notebook-outline</v-icon>
      <div class="mt-2">还没有划线或笔记</div>
      <div class="text-medium-emphasis mt-1">在正文中选择文字即可开始。</div>
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
  emits: ['close', 'locate', 'refresh'],
  props: {
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
.annotation-quote { white-space: normal; }
.annotation-content { color: rgb(var(--v-theme-on-surface)); font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.annotation-location-hint { font-size: 12px; white-space: nowrap; }
</style>
