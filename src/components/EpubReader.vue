<template>
  <v-app :theme="settings.theme" full-height density="compact">
    <!-- 底部安全区（home indicator）填充条：纯色，覆盖底部安全区为 foot 色（图片皮肤=底图下沿色）。
         顶部安全区由 html/body 的 bgTop 着色；二者配合实现顶/底不同色。z-index 低于顶/底导航。 -->
    <div id="safe-bottom" :style="{ backgroundColor: foot_color }"></div>

    <!-- 顶部菜单 -->
    <v-app-bar v-if="menu.show_navbar" density="compact">
      <template v-slot:prepend>
        <v-btn icon :title="is_debug_signal ? '返回首页' : '章评'"> <v-icon>{{ is_debug_signal ? 'mdi-arrow-left' : 'mdi-candle' }}</v-icon> </v-btn>
    </template>
      {{ is_debug_signal ? alert_msg : book_title }}
      <v-spacer></v-spacer>
      <v-btn v-if="has_audiobook" min-height="44" @click="open_audiobook" title="听书"><v-icon>mdi-headphones</v-icon><span>听书</span></v-btn>
      <v-btn ref="panelEntryAi" icon title="更多选项" @click="set_menu('ai')"> <v-icon>mdi-dots-vertical</v-icon> </v-btn>
    </v-app-bar>

    <!-- 底部菜单 -->
    <v-bottom-navigation v-model="menu.value" :active="menu.show_navbar" z-index="2599">
      <v-btn ref="panelEntryToc" value="toc" @click="set_menu('toc')">
        <v-icon>mdi-book-open-variant-outline</v-icon>
        <span>目录</span>
      </v-btn>

      <v-btn @click="switch_theme">
        <v-icon>{{ switch_theme_icon }}</v-icon>
        <span>{{ switch_theme_text }}</span>
      </v-btn>

      <v-btn ref="panelEntryAnnotations" value="annotations" @click="on_open_annotations">
        <v-icon>mdi-comment-text-outline</v-icon>
        <span>评论</span>
      </v-btn>

      <v-btn ref="panelEntrySettings" value="settings" @click="set_menu('settings')">
        <v-icon>mdi-cog</v-icon>
        <span>设置</span>
      </v-btn>

    </v-bottom-navigation>

    <audiobook-player
      v-if="has_audiobook"
      ref="audiobookPlayer"
      :visible="audiobook_open"
      :edition-id="audiobook_edition_id"
      :manifest-url="audiobook_manifest_url"
      :rendition="rendition"
      :request="audiobook_request"
      @close="audiobook_open = false"
    ></audiobook-player>

    <v-bottom-sheet class="fixed mb-14 settings-bottom-sheet reader-side-right" max-height="90%" v-model="menu.panels.settings" @update:model-value="on_panel_model_update('settings', $event)" @after-leave="on_panel_after_leave('settings')" contained z-index="234">
      <settings :settings="settings" @update="update_settings" @open-themes="open_theme_dialog"></settings>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14 reader-side-left" max-height="90%" v-model="menu.panels.toc" @update:model-value="on_panel_model_update('toc', $event)" @after-leave="on_panel_after_leave('toc')" contained close-on-content-click  z-index="234">
      <book-toc ref="bookTocComponent" :meta="book_meta" :toc_items="toc_items" :current-chapter="current_toc" @click:select="on_click_toc"></book-toc>
    </v-bottom-sheet>

    <!-- 评论抽屉（移动端 90% 高的底部抽屉，桌面端右侧侧边栏）。eager：选区和段尾气泡需要在首次打开前就能调用它。 -->
    <v-bottom-sheet class="fixed mb-14 annotation-bottom-sheet reader-side-right" v-model="menu.panels.annotations" @update:model-value="on_panel_model_update('annotations', $event)" @after-leave="on_panel_after_leave('annotations')" contained eager z-index="234"
      aria-label="评论">
      <v-card v-if="!settings.notes_enabled" class="annotation-disabled">
        <v-card-text>评论已关闭，已有数据会保留。
          <v-btn variant="text" @click="set_menu('settings')">前往设置</v-btn>
        </v-card-text>
      </v-card>
      <div v-show="settings.notes_enabled" class="annotation-sheet-body">
        <reader-comments ref="comments" :repository="annotation_repository" :user="user" :chapter="comment_chapter" :active="menu.panels.annotations"
          @write="on_write_comment" @edit="on_edit_comment" @login="request_login" @changed="on_comments_changed"
          @feedback="show_annotation_feedback" @close="set_menu('hide')"></reader-comments>
      </div>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.ai" @update:model-value="on_panel_model_update('ai', $event)" @after-leave="on_panel_after_leave('ai')" contained z-index="234">
      <v-card title="开发中"></v-card>
    </v-bottom-sheet>

    <v-dialog v-model="annotation_editor_open" class="annotation-editor-dialog rc-above-standalone" max-width="560" :persistent="annotation_saving"
      aria-labelledby="annotation-editor-title" @after-leave="on_annotation_editor_closed">
      <v-card class="annotation-editor-card" color="surface">
        <header class="annotation-editor-header">
          <h2 id="annotation-editor-title">{{ annotation_editor_title }}</h2>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="关闭评论编辑框"
            min-width="44" min-height="44" :disabled="annotation_saving" @click="annotation_editor_open = false"></v-btn>
        </header>
        <v-card-text class="annotation-editor-body">
          <section v-if="annotation_editor_quote" class="annotation-editor-reference" aria-labelledby="annotation-reference-title">
            <div class="annotation-reference-heading">
              <span id="annotation-reference-title">引用原文</span>
              <span class="annotation-reference-chapter">{{ annotation_editor_location?.toc?.label || annotation_editor_record?.chapter || current_toc_title }}</span>
            </div>
            <blockquote class="annotation-editor-quote" tabindex="0" aria-label="引用原文">{{ annotation_editor_quote }}</blockquote>
            <p class="annotation-editor-hint">{{ annotation_editor_location?.multi_paragraph ? '跨段选区 · 评论归属最后一段。' : '评论关联整个段落。' }}</p>
          </section>
          <p v-else class="annotation-editor-hint annotation-editor-book-hint">针对整本《{{ book_title }}》写下你的感受，发布后在「全书评论」中展示。</p>
          <v-textarea ref="annotationEditorContent" v-model="annotation_editor_content" class="annotation-editor-input" label="评论内容"
            variant="outlined" density="comfortable" rows="5" autofocus persistent-placeholder placeholder="写下你的想法…"
            :readonly="annotation_saving" :error-messages="annotation_editor_error" @update:model-value="annotation_editor_error = ''"></v-textarea>
        </v-card-text>
        <footer class="annotation-editor-footer">
          <div class="annotation-visibility-row">
            <v-switch id="annotation-public-switch" class="annotation-visibility" :model-value="!annotation_editor_private"
              :disabled="annotation_saving" role="switch" color="primary" density="comfortable" inset hide-details
              aria-labelledby="annotation-public-label" aria-describedby="annotation-visibility-hint"
              @update:model-value="annotation_editor_private = !$event"></v-switch>
            <label id="annotation-public-label" for="annotation-public-switch" class="annotation-visibility-label"
              :class="{ 'annotation-visibility-label-disabled': annotation_saving }">公开这条评论</label>
          </div>
          <p id="annotation-visibility-hint" class="annotation-editor-hint annotation-visibility-hint" aria-live="polite">
            {{ annotation_repository?.source === 'localStorage'
              ? '仅保存在当前浏览器，公开范围暂不生效。'
              : annotation_editor_private ? '只有你能看到这条评论。' : '其他读者可以在对应评论范围看到这条评论。' }}
          </p>
          <v-card-actions class="annotation-editor-actions">
            <v-spacer></v-spacer>
            <v-btn variant="text" :disabled="annotation_saving" @click="annotation_editor_open = false">取消</v-btn>
            <v-btn variant="flat" color="primary" :loading="annotation_saving" @click="save_note">保存</v-btn>
          </v-card-actions>
        </footer>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="annotation_feedback_visible" class="annotation-feedback" :color="annotation_feedback_error ? 'error' : 'primary'"
      :timeout="annotation_feedback_error ? -1 : 5000">
      {{ annotation_feedback_message }}
      <template v-slot:actions><v-btn variant="text" @click="annotation_feedback_visible = false">关闭</v-btn></template>
    </v-snackbar>

    <!-- 选区预览只表示当前选择，保存成功后才绘制永久标记。 -->
    <div v-for="(rect, index) in selection_preview_rects" :key="index" class="selection-preview" :style="rect" aria-hidden="true"></div>

    <!-- 文字选择工具栏：划线与评论 UI 完全由阅读器负责，宿主只注入数据回调。 -->
    <div v-show="is_toolbar_visible()" id="comments-toolbar" ref="selectionToolbar" role="group"
      aria-label="选中文字操作" :style="`left: ${toolbar_left}px; top: ${toolbar_top}px;`">
      <div class="selection-toolbar-actions">
        <v-btn class="selection-toolbar-action" variant="text" @click="copy_selection">
          <v-icon size="18" aria-hidden="true">mdi-content-copy</v-icon><span>复制</span>
        </v-btn>
        <template v-if="settings.notes_enabled">
          <v-btn class="selection-toolbar-action" variant="text" :loading="annotation_saving" @click="save_highlight">
            <v-icon size="18" aria-hidden="true">mdi-format-underline</v-icon><span>划线</span>
          </v-btn>
          <v-btn class="selection-toolbar-action" variant="text" :disabled="annotation_saving || !selected_location.paragraph_cfi" @click="open_note_editor">
            <v-icon size="18" aria-hidden="true">mdi-square-edit-outline</v-icon><span>写评论</span>
          </v-btn>
          <v-btn class="selection-toolbar-action" variant="text" :disabled="annotation_saving || !selected_location.paragraph_cfi" @click="on_view_selection_notes">
            <v-icon size="18" aria-hidden="true">mdi-comment-text-outline</v-icon><span>看本段评论</span>
          </v-btn>
        </template>
        <v-btn v-if="has_audiobook" class="selection-toolbar-action" variant="text" @click="on_click_toolbar_listen">
          <v-icon size="18" aria-hidden="true">mdi-headphones</v-icon><span>从这里听</span>
        </v-btn>
      </div>
    </div>

    <!-- 阅读界面 -->
    <v-main id='main' class="pa-0">
      <v-overlay v-model="loading" z-index="auto" class="align-center justify-center" persistent>
        <v-progress-circular indeterminate size="64" color="primary"></v-progress-circular>
      </v-overlay>

      <!-- 加载较慢 / 加载失败提示框：加载慢时不中断，加载完成后自动关闭 -->
      <v-dialog v-model="showTimeoutDialog" max-width="500px" aria-labelledby="load-dialog-title">
        <v-card>
          <v-card-title id="load-dialog-title" class="text-h5 text-center">{{ load_failed ? '加载失败' : '加载较慢' }}</v-card-title>
          <v-card-text class="text-center">
            {{ load_failed ? '电子书加载失败，可能是网络问题或文件格式不支持。' : '电子书还在加载，可能是网络较慢。加载完成后此提示会自动关闭。' }}
          </v-card-text>
          <v-card-actions class="justify-center">
            <v-btn color="primary" variant="text" @click="showTimeoutDialog = false">
              {{ load_failed ? '关闭' : '继续等待' }}
            </v-btn>
            <v-btn color="primary" variant="flat" @click="retryLoad">
              重试
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <div id="status-bar-top" :class="settings.theme" :style="status_bar_style">
        <div id="status-bar-left" class="align-start">
          {{ current_toc_title }}
        </div>
        <div id="status-bar-right" class="align-end">
           ({{ readingProgress }})
        </div>
      </div>
      <div id="reader"></div>
      <div id="status-bar-bottom" :class="settings.theme" :style="status_bar_style">
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: readingProgress }"></div>
        </div>
      </div>
    </v-main>

    <!-- 「更多主题」二级窗口：放在顶层（不嵌在设置面板里），避免被顶/底栏遮挡；小屏全屏 -->
    <v-dialog v-model="show_theme_dialog" max-width="520" scrollable :fullscreen="$vuetify.display.smAndDown">
      <v-card>
        <v-card-title class="d-flex align-center">
          <span>阅读皮肤</span>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" density="compact" @click="show_theme_dialog = false"></v-btn>
        </v-card-title>
        <v-card-text>
          <template v-for="group in theme_groups" :key="group.mode">
            <div class="theme-group-label">{{ group.label }}</div>
            <div class="theme-grid">
              <div class="theme-cell" v-for="t in group.items" :key="t.id">
                <div class="theme-card" :class="{ active: settings.theme === t.id }" :style="theme_card_style(t)"
                  @click="pick_theme(t)">
                  <span class="theme-sample" :style="{ color: t.text }">{{ t.sample }}</span>
                  <!-- 小勾：标注当前白天/夜晚分别选用的皮肤（theme_day / theme_night），即日夜切换按钮的两端 -->
                  <v-icon v-if="t.id === settings.theme_day || t.id === settings.theme_night"
                    class="theme-check" size="18"
                    :title="t.mode === 'day' ? '当前白天皮肤' : '当前夜晚皮肤'">mdi-check-circle</v-icon>
                  <span class="theme-badge" v-if="settings.theme === t.id">使用中</span>
                </div>
                <div class="theme-name">{{ t.name }}</div>
              </div>
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>

  </v-app>
</template>

<script>
/* global ePub */
import { normalizeNoteSettings } from '@/note-settings'
import Settings from './Settings.vue'
import BookToc from './BookToc.vue'
import ReaderComments from './comments/ReaderComments.vue'
import AudiobookPlayer from './AudiobookPlayer.vue'
import { createAnnotationCallbacks, createClientId } from '@/annotations'
import { THEMES, getTheme } from '@/themes'

const PUBLIC_PREFERENCE_KEY = 'candle-reader:comment-public'
// 网速慢时（如 3Mbps 下首次打开要下载十几 MB）正文可能要半分钟以上才出来，超过这个时间才提示「加载较慢」。
const LOAD_TIMEOUT_MS = 60000

export default {
  name: 'EpubReader',
  components: {
    Settings,
    BookToc,
    ReaderComments,
    AudiobookPlayer
  },
  props: {
    book_url: { type: String, required: true },
    display_url: { type: String, default: '' },
    debug: { type: Boolean, default: false },
    themes_css: { type: String, default: 'theme.css' },
    initial_book_id: { type: [Number, String], default: null },
    annotation_callbacks: { type: Object, default: null },
    audiobook_edition_id: { type: [Number, String], default: null },
    audiobook_manifest_url: { type: String, default: '' },
  },
  computed: {
    comments_enabled: function () { return this.settings.notes_enabled && this.settings.show_comments; },
    comment_chapter: function () { return String(this.current_toc?.label || this.current_toc_title || '').trim(); },
    annotation_editor_title: function () {
      if (this.annotation_editor_record) return '编辑评论';
      return this.annotation_editor_type === 'book_comment' ? '写整书评论' : '写评论';
    },
    annotation_editor_quote: function () {
      const location = this.annotation_editor_location;
      if (location) return location.multi_paragraph ? location.quote_text : location.paragraph_quote_text;
      return this.annotation_editor_record?.quote_text || '';
    },
    has_audiobook: function () {
      return Boolean(this.audiobook_edition_id || this.audiobook_manifest_url);
    },
    switch_theme_icon: function () {
      // 当前是白天主题则显示「切换到夜晚」的图标，反之亦然
      const isDayTheme = getTheme(this.settings.theme).mode === 'day';
      return isDayTheme ? "mdi-weather-night" : "mdi-weather-sunny";
    },
    switch_theme_text: function () {
      const isDayTheme = getTheme(this.settings.theme).mode === 'day';
      return isDayTheme ? "夜晚" : "白天";
    },
    foot_color: function () {
      // 底部安全区（home indicator）填充色：图片皮肤用 bgBottom（底图下沿色），否则回退 bg
      const t = getTheme(this.settings.theme);
      return t.bgBottom || t.bg;
    },
    status_bar_style: function () {
      // 图片皮肤下状态栏透明、仅跟随主题文字色，透出铺在 #main 上的背景图，
      // 与正文区域同一张图连续衔接；纯色主题交给 themes.css。
      const t = getTheme(this.settings.theme);
      if (t.type !== 'image') return {};
      return { color: t.text, backgroundColor: 'transparent' };
    },
    // 「更多主题」窗口按白天/夜晚分区
    theme_groups: function () {
      return [
        { mode: 'day', label: '白天', items: THEMES.filter(t => t.mode === 'day') },
        { mode: 'night', label: '夜晚', items: THEMES.filter(t => t.mode === 'night') },
      ];
    },
    totalChapters: function() {
      // 计算总章节数
      let count = 0;

      function countChapters(tocArray) {
        for (const item of tocArray) {
          count++;
          if (item.subitems && item.subitems.length > 0) {
            countChapters(item.subitems);
          }
        }
      }

      countChapters(this.toc_items);
      return count;
    },
    currentChapterIndex: function() {
      // 获取当前章节索引
      if (!this.current_toc) return 0;

      const allChapters = [];

      function getAllChapters(tocArray) {
        for (const item of tocArray) {
          allChapters.push(item);
          if (item.subitems && item.subitems.length > 0) {
            getAllChapters(item.subitems);
          }
        }
      }

      getAllChapters(this.toc_items);

      // 查找当前章节在数组中的索引
      for (let i = 0; i < allChapters.length; i++) {
        const chapter = allChapters[i];
        if ((chapter.id && this.current_toc.id && chapter.id === this.current_toc.id) ||
            (chapter.href === this.current_toc.href && chapter.label === this.current_toc.label)) {
          return i + 1; // 返回从1开始的索引
        }
      }

      return 0;
    },
    readingProgress: function() {
      // 计算阅读进度百分比，直接返回包含百分号的字符串
      if (this.totalChapters === 0) return '0%';
      const percentage = Math.round((this.currentChapterIndex / this.totalChapters) * 100);
      return `${percentage}%`;
    },
  },
  methods: {
    audiobook_request: async function (url, options = {}) {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'include',
        ...options,
      });
      const payload = await response.json();
      if (!response.ok && !payload?.err) throw new Error(`有声书接口请求失败（${response.status}）`);
      return payload;
    },
    open_audiobook: function () {
      this.set_menu('hide');
      this.audiobook_open = true;
      this.$nextTick(() => this.$refs.audiobookPlayer?.loadManifest());
    },
    suspend_audiobook_follow: function () {
      this.$refs.audiobookPlayer?.suspendFollow();
    },
    on_click_toolbar_listen: function () {
      const selection = this.selected_location;
      this.hide_toolbar();
      this.audiobook_open = true;
      this.$nextTick(() => this.$refs.audiobookPlayer?.playFromSelection(selection));
    },
    initialize_annotations: function () {
      try {
        this.annotation_repository = createAnnotationCallbacks({
          callbacks: this.annotation_callbacks,
          bookId: this.initial_book_id,
          bookUrl: this.book_url,
        });
      } catch (error) {
        console.error('Candle Reader annotations could not be initialized:', error);
      }
    },
    annotation_color: function (annotation) {
      const colors = { blue: '#4f8fb8', green: '#54a675', pink: '#d97a9d', yellow: '#e6b91e' };
      return colors[annotation?.color] || annotation?.color || (annotation?.annotation_type === 'note' ? '#4f8fb8' : '#e6b91e');
    },
    render_annotation: function (annotation) {
      if (!this.settings.notes_enabled || !this.rendition || !annotation?.cfi || annotation.annotation_type === 'book_comment') return;
      // epub.js indexes highlights by CFI, so multiple records at one range
      // must share one mark or remove(cfi) can leave an orphaned SVG behind.
      const identity = String(annotation.cfi);
      if (identity && this.rendered_annotation_ids.has(identity)) return;
      try {
        this.rendition.annotations.highlight(
          annotation.cfi,
          { annotationId: annotation.id || annotation.client_id },
          () => this.open_comments('chapter'),
          'candle-reader-annotation',
          { fill: this.annotation_color(annotation), 'fill-opacity': '0.38', 'mix-blend-mode': 'multiply' },
        );
        if (identity) this.rendered_annotation_ids.add(identity);
        this.rendered_annotations.push(annotation);
      } catch (error) {
        console.warn('Candle Reader annotation could not be rendered:', identity, error);
      }
    },
    clear_annotation_marks: function () {
      if (this.rendition?.annotations) {
        this.rendered_annotations.forEach(annotation => {
          try {
            this.rendition.annotations.remove(annotation.cfi, 'highlight');
          } catch (error) {
            console.warn('Candle Reader annotation could not be removed:', error);
          }
        });
      }
      this.rendered_annotations = [];
      this.rendered_annotation_ids.clear();
    },
    load_user: async function () {
      try {
        this.user = await this.annotation_repository?.user() || null;
      } catch (error) {
        console.warn('Candle Reader current user could not be loaded:', error);
      }
    },
    // 游客触发写评论、划线、赞踩、回复时引导登录；登录流程由宿主负责。
    request_login: async function () {
      this.show_annotation_feedback('请先登录后再操作');
      try {
        await this.annotation_repository?.login();
        await this.load_user();
      } catch (error) {
        console.warn('Candle Reader login callback failed:', error);
      }
    },
    // 读取本章自己的划线与评论，用于在正文绘制标记。
    load_chapter_annotations: async function (chapter) {
      if (!chapter || !this.annotation_repository || !this.settings.notes_enabled) return;
      const request = ++this.annotation_chapter_request;
      try {
        const annotations = await this.annotation_repository.load({ chapter });
        if (request !== this.annotation_chapter_request) return;
        annotations.forEach(this.render_annotation);
      } catch (error) {
        console.warn('Candle Reader chapter annotations could not be loaded:', error);
      }
    },
    open_comments: function (scope, paragraph = null) {
      this.comment_paragraph = paragraph;
      this.hide_toolbar();
      if (this.menu.current_panel !== 'annotations') this.set_menu('annotations');
      if (this.settings.notes_enabled) this.$refs.comments?.show(scope, paragraph?.paragraph_cfi || '');
    },
    on_open_annotations: function () {
      if (this.menu.current_panel === 'annotations') return this.set_menu('hide');
      this.open_comments('chapter');
    },
    on_view_selection_notes: function () {
      if (!this.selected_location?.paragraph_cfi) return;
      this.open_comments('paragraph', this.selected_location);
    },
    show_annotation_feedback: function (message, error = false) {
      this.annotation_feedback_message = message;
      this.annotation_feedback_error = error;
      this.annotation_feedback_visible = true;
    },
    // 评论增删或公开范围变化后，同步正文中的标记与段尾气泡。
    on_comments_changed: function () {
      this.clear_annotation_marks();
      this.load_chapter_annotations(this.comment_chapter);
      this.refresh_comment_icons();
    },
    read_public_preference: function () {
      try { return localStorage.getItem(PUBLIC_PREFERENCE_KEY) !== 'false'; } catch (error) { return true; }
    },
    save_annotation: async function (annotationType, content, isPrivate) {
      if (!this.settings.notes_enabled) return null;
      if (!this.user) { this.request_login(); return null; }
      const passage = annotationType === 'highlight' ? this.selected_location : this.annotation_editor_location;
      const isNote = annotationType === 'note';
      const cfi = isNote ? passage?.paragraph_cfi : passage?.cfi;
      const quote = isNote && !passage?.multi_paragraph ? passage?.paragraph_quote_text : passage?.quote_text;
      if (!cfi || !quote || !this.annotation_repository || this.annotation_saving) return null;
      this.annotation_saving = true;
      try {
        const annotation = await this.annotation_repository.save({
          client_id: passage.client_id || createClientId(),
          annotation_type: annotationType,
          is_private: annotationType === 'highlight' ? true : isPrivate,
          chapter: String(passage.toc?.label || this.current_toc_title || '').trim(),
          // 评论归属段落（跨段时为最后一段）与真实选区分开保存。
          cfi: String(cfi),
          range_cfi: String(passage.cfi || cfi),
          quote_text: quote,
          content,
          color: isNote ? 'blue' : 'yellow',
        });
        this.render_annotation(annotation);
        this.hide_toolbar();
        try { passage.contents?.window?.getSelection()?.removeAllRanges(); } catch (error) { /* noop */ }
        if (this.selected_location === passage) this.selected_location = {};
        return annotation;
      } catch (error) {
        this.show_annotation_feedback(`保存失败：${error.message || '请稍后重试'}`, true);
        return null;
      } finally {
        this.annotation_saving = false;
      }
    },
    save_highlight: function () {
      return this.save_annotation('highlight', '', true);
    },
    open_editor: function ({ location = null, record = null, type = 'note' }) {
      this.annotation_editor_location = location;
      this.annotation_editor_record = record;
      this.annotation_editor_type = record?.annotation_type || type;
      this.annotation_editor_content = record?.content || '';
      this.annotation_editor_error = '';
      // 新建沿用最近一次公开范围选择；编辑显示该记录自己的公开范围。
      this.annotation_editor_private = record ? record.is_private !== false : !this.read_public_preference();
      this.annotation_editor_open = true;
    },
    open_note_editor: function () {
      if (!this.settings.notes_enabled || !this.selected_location?.paragraph_cfi) return;
      if (!this.user) return this.request_login();
      this.hide_toolbar(true);
      this.open_editor({ location: this.selected_location });
    },
    // 抽屉与完整评论页底部的「写评论」：本段范围写段落评论，其余范围写整书评论。
    on_write_comment: function ({ scope }) {
      if (scope === 'paragraph' && this.comment_paragraph?.paragraph_cfi) {
        this.open_editor({ location: { ...this.comment_paragraph, client_id: createClientId() } });
      } else {
        this.open_editor({ type: 'book_comment' });
      }
    },
    on_edit_comment: function (record) {
      this.open_editor({ record });
    },
    save_note: async function () {
      const content = this.annotation_editor_content.trim();
      if (!content) {
        this.annotation_editor_error = '请填写评论内容';
        this.$nextTick(() => this.$refs.annotationEditorContent?.focus());
        return;
      }
      const isPrivate = this.annotation_editor_private;
      const record = this.annotation_editor_record;
      let saved = null;
      if (record || this.annotation_editor_type === 'book_comment') {
        if (this.annotation_saving) return;
        this.annotation_saving = true;
        try {
          saved = await this.annotation_repository.save(record
            ? { id: record.id, client_id: record.client_id, annotation_type: record.annotation_type, content, is_private: isPrivate }
            : {
              client_id: createClientId(),
              annotation_type: 'book_comment',
              is_private: isPrivate,
              chapter: '',
              // 整书评论关联到全书最开头。
              cfi: `epubcfi(${this.book.spine.first().cfiBase}!/4)`,
              quote_text: '',
              content,
            });
        } catch (error) {
          this.show_annotation_feedback(`保存失败：${error.message || '请稍后重试'}`, true);
        } finally {
          this.annotation_saving = false;
        }
      } else {
        saved = await this.save_annotation('note', content, isPrivate);
      }
      if (!saved) return;
      if (!record) {
        try { localStorage.setItem(PUBLIC_PREFERENCE_KEY, String(!isPrivate)); } catch (error) { /* noop */ }
      }
      this.annotation_editor_open = false;
      this.$refs.comments?.apply_saved(saved);
      this.on_comments_changed();
      const where = saved.annotation_type === 'book_comment' ? '全书评论' : '';
      this.show_annotation_feedback(isPrivate ? '已保存为私密，可在「查看更多评论 › 我的」中查看'
        : where ? `评论已保存，可在「${where}」中查看` : '评论已保存');
    },
    on_annotation_editor_closed: function () {
      const closingLocation = this.annotation_editor_location;
      this.annotation_editor_location = null;
      this.annotation_editor_record = null;
      if (closingLocation && this.selected_location === closingLocation) {
        this.clear_selection_preview();
        try { closingLocation?.contents?.window?.getSelection()?.removeAllRanges(); } catch (error) { /* noop */ }
        this.selected_location = {};
      }
      if (!this.selected_location?.cfi) this.restore_reader_focus();
    },
    restore_reader_focus: function () {
      document.querySelector('#reader iframe')?.focus();
    },
    copy_selection: async function () {
      const text = this.selected_location?.quote_text;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        this.hide_toolbar();
        this.show_annotation_feedback('已复制选中文字');
      } catch (error) {
        this.show_annotation_feedback('复制失败，请使用系统复制功能', true);
      }
    },
    switch_theme: function () {
      // 在「最近用过的白天主题」与「最近用过的夜晚主题」之间切换
      const isDayTheme = getTheme(this.settings.theme).mode === 'day';
      const next = isDayTheme
        ? (this.settings.theme_night || "grey")
        : (this.settings.theme_day || "white");
      this.apply_theme(next);
      this.save_settings();
    },
    // 应用一套主题（按 id）。solid 走 themes.css 的 class；image 走外层背景图 + iframe 透明 + 文字色强制。
    apply_theme: function (id) {
      const t = getTheme(id);
      this.settings.theme = t.id;
      this.settings.theme_mode = t.mode;
      this.settings['theme_' + t.mode] = t.id;   // 记住该模式下最近选择

      // 外层容器背景图（image 皮肤按屏幕方向选竖/横版大图）
      this.apply_skin_background(t);

      // 浏览器 UI 主题色（iOS Safari 顶部状态栏/灵动岛、Android 地址栏跟随主题底色）
      this.apply_theme_color(t);

      // iframe 内：切换主题 class（solid 命中 themes.css），再叠加自定义样式
      if (this.rendition) {
        this.rendition.themes.select(t.id);
        this.apply_custom_style(t);
      }
    },
    // 「更多主题」卡片预览样式：图片皮肤用缩略图，纯色用背景色
    theme_card_style: function (t) {
      if (t.type === 'image') {
        return {
          backgroundColor: t.bg,
          backgroundImage: `url(${t.thumb})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      }
      return { backgroundColor: t.bg };
    },
    // 打开「更多主题」窗口：先关掉设置面板，避免弹窗被 Vuetify 全局栈压在低层（设置面板 z-index 仅 234），
    // 关闭后弹窗成为唯一活动 overlay，获得默认高层级，从而盖过顶栏/底部导航。
    open_theme_dialog: function () {
      this.set_menu('hide');
      this.$nextTick(() => { this.show_theme_dialog = true; });
    },
    // 在「更多主题」窗口里选定主题：应用并关闭窗口
    pick_theme: function (t) {
      this.apply_theme(t.id);
      this.save_settings();
      this.show_theme_dialog = false;
    },
    // 让 iOS 顶/底安全区（刘海/灵动岛、home indicator）跟随主题色。
    // 关键：viewport-fit=cover 下安全区露出的是最底层 html/body 背景，且 iOS 只认
    // background-COLOR（不渲染 gradient/image），故必须用纯色。html/body 设 bgTop（顶部色）；
    // 底部若要不同色（图片皮肤 foot），由模板里的 #safe-bottom 固定填充条用纯色覆盖（见 foot_color）。
    // 纯色皮肤不设 bgTop/bgBottom，回退到 bg。meta 用顶部色。
    apply_theme_color: function (t) {
      t = t || getTheme(this.settings.theme);
      document.documentElement.style.backgroundColor = t.bgTop || t.bg;
      document.body.style.backgroundColor = t.bgTop || t.bg;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t.bgTop || t.bg);
    },
    // 背景图铺在 #main（v-main）上：覆盖上/下状态栏与正文区域，整屏一张图连续衔接。
    // image 皮肤按屏幕方向选竖版/横版大图（cover）；正文 iframe 与状态栏透明后透出。
    // （图放在主文档而非 iframe 内——iframe 在分栏模式下宽达数十万 px，背景会被拉伸失效。）
    apply_skin_background: function (t) {
      t = t || getTheme(this.settings.theme);
      const main = document.getElementById('main');
      if (!main) return;
      if (t.type === 'image') {
        const img = (window.innerWidth >= window.innerHeight) ? t.landscape : t.portrait;
        main.style.backgroundColor = t.bg;
        main.style.backgroundImage = `linear-gradient(${t.mask}, ${t.mask}), url("${img}")`;
        main.style.backgroundSize = 'cover';
        main.style.backgroundPosition = 'center';
        main.style.backgroundRepeat = 'no-repeat';
      } else {
        main.style.backgroundColor = '';
        main.style.backgroundImage = '';
      }
    },
    // 通过 themes.default() 注入正文样式：行距/字距 +（仅 image 皮肤）正文透明 + 强制文字色。
    // 纯色主题保持「弱覆盖」：不强制 color/background，由 themes.css 的同名 class 处理（沿用旧行为）。
    // 注意：epub.js 的 addStylesheetRules 是往同一 <style> 追加而非替换，多次切换会累积，
    // 故每次先移除已注入的 default 规则节点，确保 image 皮肤的 !important 规则不会残留到 solid 主题。
    apply_custom_style: function (t) {
      t = t || getTheme(this.settings.theme);
      this.rendition.getContents().forEach(c => {
        const el = c.document && c.document.getElementById('epubjs-inserted-css-default');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      const decl = {
        'line-height': `${this.settings.line_height} !important`,
        'letter-spacing': `${this.settings.letter_spacing}px !important`,
      };
      // 开启选中工具栏时，尽量关掉 iOS 系统的文字菜单（拷贝/查询…），避免和我们的工具栏同时出现；关闭工具栏时保留系统菜单用于复制。
      if (this.settings.notes_enabled && this.settings.show_selection_toolbar) decl['-webkit-touch-callout'] = 'none !important';
      const rules = { 'body, body *': decl };
      if (t.type === 'image') {
        // 图片皮肤：html 和 body 都设透明，iframe 才能真正透出 #reader 上的背景图
        //（只设 body 透明时 iframe 仍会渲染成白色画布盖住背景，必须连 html 一起透明）。
        // color-scheme 必须与外层 app 主题（夜=dark/昼=light）一致：否则夜间皮肤下
        // Chrome 判定「深色页面里嵌了浅色内容」，会给 iframe 画布刷一层不透明的
        // color-adjust 背景（表现为纯白），盖住 #reader 背景图——这正是夜间皮肤变白的根因。
        rules['html'] = {
          'background': 'transparent !important',
          'color-scheme': t.mode === 'night' ? 'dark' : 'light',
        };
        decl['background-color'] = 'transparent !important';
        decl['color'] = `${t.text} !important`;
      }
      this.rendition.themes.default(rules);
    },
    on_panel_model_update: function (panel, open) {
      // Escape/outside clicks update v-model without going through set_menu.
      if (!open && this.menu.current_panel === panel) this.set_menu('hide');
    },
    on_panel_after_leave: function (panel) {
      // An outgoing sibling must not steal focus from the incoming sheet.
      if (panel !== this.panel_closing || Object.values(this.menu.panels).some(Boolean)) return;
      if (this.show_theme_dialog || this.annotation_editor_open) return;
      const usable = el => el?.isConnected && !el.disabled && !el.closest('[inert], .v-overlay') && el.getClientRects().length;
      const fallback = this.$refs[this.panel_entry_ref]?.$el || this.$refs.panelEntryAnnotations?.$el;
      const target = usable(this.panel_trigger) ? this.panel_trigger : fallback;
      if (usable(target)) target.focus({ preventScroll: true });
      this.panel_closing = null;
      this.panel_trigger = null;
    },
    set_menu: function (target_menu_panel) {
      var target = target_menu_panel;
      if (this.menu.current_panel == target) {
        if (this.menu.panels[target] === true) {
          target = 'hide';
        }
      }

      if (target !== 'annotations') this.$refs.comments?.close_pages();
      if (target === 'hide') {
        if (this.menu.current_panel !== 'hide') this.panel_closing = this.menu.current_panel;
      } else {
        const active = document.activeElement;
        const external = active?.matches('button, a[href], [tabindex]') && !active.closest('.v-overlay');
        if (external || !this.panel_trigger) {
          const refs = { settings: 'panelEntrySettings', toc: 'panelEntryToc', ai: 'panelEntryAi' };
          this.panel_entry_ref = refs[target] || 'panelEntryAnnotations';
          this.panel_trigger = external ? active : this.$refs[this.panel_entry_ref]?.$el;
        }
        this.panel_closing = null;
      }

      this.menu.value = (target == 'hide') ? undefined : target;
      console.log("set menu = ", target, ", current menu.value=", this.menu.value);
      this.menu.current_panel = target;
      this.menu.show_navbar = true;
      for (var k in this.menu.panels) {
        this.menu.panels[k] = (k == target);
      }

      // 当打开目录时，延迟一下确保DOM更新，然后触发滚动
      if (target === 'toc') {
        setTimeout(() => {
          // 触发目录组件的滚动逻辑
          this.$refs.bookTocComponent && this.$refs.bookTocComponent.scrollToCurrentChapter();
        }, 300);
      }
    },
    save_settings: function() {
      // 保存设置到localStorage
      localStorage.setItem('readerSettings', JSON.stringify(this.settings));
    },
    update_settings: function (opt) {
      const annotationsWereEnabled = this.settings.notes_enabled;
      const commentsWereEnabled = this.comments_enabled;
      if (opt.flow != this.settings.flow) {
        // FIXME 切换后，翻页到下一章时css会丢失
        this.rendition.flow(opt.flow)
        this.set_menu('hide')
      }
      for (const key in opt) {
        this.settings[key] = opt[key];
      }
      // 应用主题（含外层背景图、iframe 透明/文字色、行距字距）
      this.apply_theme(this.settings.theme);

      if (annotationsWereEnabled && !this.settings.notes_enabled) {
        this.annotation_chapter_request++;
        this.annotation_editor_open = false;
        if (this.menu.current_panel === 'annotations') this.set_menu('hide');
        this.clear_annotation_marks();
      } else if (!annotationsWereEnabled && this.settings.notes_enabled) {
        this.load_chapter_annotations(this.comment_chapter);
      }

      if (!this.settings.notes_enabled || !this.settings.show_selection_toolbar) this.hide_toolbar();
      if (commentsWereEnabled !== this.comments_enabled) this.refresh_comment_icons();

      // 应用亮度设置（作用于 #main，整屏含背景图与状态栏一起调光）
      if (opt.brightness !== undefined) {
        const brightness = opt.brightness / 100;
        document.getElementById('main').style.filter = `brightness(${brightness})`;
      }

      // 应用字体大小设置
      if (opt.font_size !== undefined) {
        this.rendition.themes.fontSize(opt.font_size + 'px');
      }

      this.save_settings();
    },
    on_click_toc: function (item) {
      console.log(item);
      this.set_menu("hide");
      this.suspend_audiobook_follow();
      this.rendition.display(item.id);
    },
    on_mousedown: function (event) {
      this.mouse_down_time = new Date();
      this.mouse_down_point = event ? { x: event.clientX, y: event.clientY } : null;
    },
    on_mouseup: function (event) {
      const t = new Date() - this.mouse_down_time;
      // 按住拖动选字时，松开后浏览器同样会发 click：拖动距离明显或按得久都按选字处理。
      const point = this.mouse_down_point;
      const dragged = Boolean(point && event) && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 8;
      this.check_if_selected_content = t > 600 || dragged;
    },
    on_click_content: function (event) {
      // 快速拖选时 click 早于 epub.js 的 selected 事件（约 250ms 后才发）：此时正文里已有选区，不能当作点击翻页。
      // 双击选词同理（event.detail 为连击次数）。
      if (event?.type === 'click' && event.view?.getSelection?.()?.isCollapsed === false && (event.detail >= 2
        || (this.mouse_down_point && Math.hypot(event.clientX - this.mouse_down_point.x, event.clientY - this.mouse_down_point.y) > 8))) {
        this.is_handlering_selected_content = false;
        return;
      }
      // 已有选中文字时点别处：只取消选中、收起工具栏，这一下不翻页。
      // iOS 上轻点时选区在 click 之前就被系统清掉了，读不到选区，所以以 epub.js 报过的选中状态为准。
      if (this.selection_active || this.clear_text_selection()) {
        this.clear_text_selection();
        this.hide_toolbar();
        return;
      }
      if (!this.check_if_selected_content) {
        return this.smart_click(event)
      }

      // epub.js 中要等待 250ms 才检测是否为selected
      // 所以这里也要等待一下，优先执行 selected 操作
      setTimeout(() => {
        if (!this.is_handlering_selected_content) {
          this.smart_click(event);
        } else {
          this.is_handlering_selected_content = false;
        }
      }, 300);
    },
    clear_text_selection: function () {
      let cleared = false;
      for (const contents of this.rendition?.getContents() || []) {
        const selection = contents.window?.getSelection();
        if (selection && !selection.isCollapsed) {
          selection.removeAllRanges();
          cleared = true;
        }
      }
      if (cleared) this.clear_selection_preview();
      return cleared;
    },
    smart_click: function (event) {
      const rect = event.view.frameElement.getBoundingClientRect();
      const viewer = document.getElementById('reader');
      const width = viewer.offsetWidth;
      const height = viewer.offsetHeight;
      const x = (event.clientX + rect.x) % viewer.offsetWidth;
      const y = (event.clientY + rect.y) % viewer.offsetHeight;
      this.debug_click(x, y, width, height)


      // 如果工具栏还在，那么这次点击视作「隐藏工具栏」
      if (this.is_toolbar_visible()) {
        this.hide_toolbar();
        return;
      }

      // 按照功能区的点击处理
      // 顶部&底部翻页在宽屏模式下不生效
      const is_mobile = width < this.wide_screen
      const N = is_mobile ? 3 : 5;
      const is_keyboard_only = this.settings.paging_control === "keyboard_only";

      if ( x < width / N || (is_mobile && y < height / N)) {
        // 点击左侧，往前翻页
        if (!is_keyboard_only) {
          this.suspend_audiobook_follow();
          this.rendition.prev();
        }
      } else if (x > width * (N-1) / N || (is_mobile && y > height * (N-1) / N)) {
        // 点击右侧，往后翻页
        if (!is_keyboard_only) {
          this.suspend_audiobook_follow();
          this.rendition.next().then();
        }
      } else {
        // 点击中间，显示菜单
        console.log("-- toggle menu");
        this.menu.show_navbar = !this.menu.show_navbar;
      }
    },
    bin_search: function (subitems, cfi, contents) {
      var left = 0;
      var right = subitems.length;
      // 在sub里搜索
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (mid == left) {
          break;
        }
        const sub = subitems[mid];
        if (sub.cfi === undefined) {
          if (sub.href.indexOf("#") > 0) {
            const pos = sub.href.split("#")[1];
            sub.elem = contents.document.getElementById(pos);
          } else {
            sub.elem = contents.document.getElementsByTagName("p")[0];
          }
          sub.cfi = new ePub.CFI(sub.elem, contents.cfiBase);
          sub.cfi = new ePub.CFI(sub.cfi.toString()); // 强制转成标准格式
        }
        const cmp = this.book.locations.epubcfi.compare(cfi, sub.cfi);
        // console.log(left, mid, right, sub)
        // console.log("compare, cmp = ", cmp, cfi, sub.cfi)
        if (cmp == 0) {
          return sub;
        }
        if (cmp < 0) {
          right = mid;
        }
        if (cmp > 0) {
          left = mid;
        }
      }
      const found = subitems[left]
      if (found.cfi === undefined) {
        if (found.href.indexOf("#") > 0) {
          const pos = found.href.split("#")[1];
          found.elem = contents.document.getElementById(pos);
        } else {
          found.elem = contents.document.getElementsByTagName("p")[0];
        }
        found.cfi = new ePub.CFI(found.elem, contents.cfiBase);
      }
      return found;
    },
    find_same_href_in_toc_tree: function (toc_tree, target_href) {
      for (var idx in toc_tree) {
        const toc = toc_tree[idx];
        if (toc.href == target_href) {
          return toc
        }
        if (toc.subitems !== undefined && toc.subitems.length > 0) {
          const found = this.find_same_href_in_toc_tree(toc.subitems, target_href);
          if (found !== undefined) {
            return found
          }
        }
      }
      return;
    },
    find_toc_in_same_file: function (cfi, contents, href) {
      const chapters = [];
      const collect = items => items.forEach(item => {
        if (String(item.href || '').split('#')[0] === href) chapters.push(item);
        if (item.subitems?.length) collect(item.subitems);
      });
      collect(this.toc_items);
      let found;
      for (const chapter of chapters) {
        // 正文重新渲染后旧元素已失效，需要重新定位。
        if (chapter.elem?.ownerDocument !== contents.document) {
          const elem = contents.document.getElementById(chapter.href.split('#')[1] || '');
          if (!elem) continue;
          chapter.elem = elem;
          chapter.cfi = new ePub.CFI(new ePub.CFI(elem, contents.cfiBase).toString());
        }
        if (found && this.book.locations.epubcfi.compare(cfi, chapter.cfi) < 0) break;
        found = chapter;
      }
      return found;
    },
    find_toc: function (search_cfi, contents) {
      const cfi = new ePub.CFI(search_cfi.toString()); // 强制转成标准格式
      const section = this.book.spine.get(contents.sectionIndex);

      // 获取当前所属的章节（可能是一个包含N个小节的卷）
      const toc = this.find_same_href_in_toc_tree(this.toc_items, section.href);
      console.log("got spine href in toc:", toc)
      if (toc === undefined) {
        // 目录项都带锚点（一个正文文件里有多章）时，按位置取光标之前最近的那一章。
        const chapter = this.find_toc_in_same_file(cfi, contents, section.href);
        if (chapter) return chapter;
        // NCX/navigation can omit a readable spine item. Keep a stable chapter
        // context for both selection saves and reload/re-enable annotation loads.
        // Do not insert this synthetic entry into the book's actual TOC.
        if (contents.annotationFallbackToc) return contents.annotationFallbackToc;
        const body = contents.document.body;
        const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
        contents.annotationFallbackToc = {
          href: section.href,
          label: heading?.textContent.trim() || `正文 ${section.index + 1}`,
          elem: body,
          cfi: new ePub.CFI(body, contents.cfiBase),
          subitems: [],
          is_fallback: true,
        };
        return contents.annotationFallbackToc;
      }

      // 填充 cfi 定位信息
      if (toc.elem === undefined) {
        const tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p"];
        for (let tag of tags) {
          const elems = contents.document.getElementsByTagName(tag)
          if (elems.length > 0) {
            toc.elem = elems[0];
            break;
          }
        }
        const toc_cfi = new ePub.CFI(toc.elem, contents.cfiBase);
        toc.cfi = new ePub.CFI(toc_cfi.toString());
      }

      // 如果没有子目录，那就是它自己了
      var found = toc;
      if (toc.subitems.length > 0) {
        // 二分查找子目录，并检查是否在第一个subitem之前
        found = this.bin_search(toc.subitems, cfi, contents);
        if (this.book.locations.epubcfi.compare(cfi, found.cfi) < 0) {
          found = toc
        }
      }
      console.log("find_toc = ", found)
      return found;
    },
    count_distinct_between: function (start_elem, end_elem) {
      // 获取父节点
      var end = end_elem;
      while (end && end.parentElement != start_elem.parentNode) {
        end = end.parentElement;
      }
      if (!end) {
        // 章节锚点与段落不在同一层级（一个文件里有多章时常见），按文档顺序数两者之间的段落。
        const blocks = Array.from(start_elem.ownerDocument.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
        const first = blocks.findIndex(block => block === start_elem || block.contains(start_elem) || (start_elem.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING));
        return Math.max(0, blocks.indexOf(end_elem) - first);
      }

      // 初始化计数器
      let segment_id = 0;

      // 从 startElement 开始遍历到 endElement
      let currentNode = start_elem; // 获取 startElement 之后的第一个兄弟节点

      // 从起始节点开始遍历到结束节点
      while (currentNode && currentNode!== end) {
        const node_name = currentNode.nodeName.toUpperCase();
          if (node_name === "P" || node_name[0] === "H") {
            segment_id ++;
          }
          // 如果当前节点有子节点，则进入子节点
          if (currentNode.firstChild) {
              currentNode = currentNode.firstChild;
          // 否则尝试下一个兄弟节点
          } else if (currentNode.nextSibling) {
              currentNode = currentNode.nextSibling;
          // 如果没有子节点和兄弟节点，则回溯到父节点的下一个兄弟节点
          } else {
              while (!currentNode.nextSibling && currentNode.parentNode) {
                  currentNode = currentNode.parentNode;
              }
              currentNode = currentNode.nextSibling;
          }
      }

      return segment_id;
    },
    clear_selection_preview: function () {
      this.selection_preview_rects = [];
    },
    update_selection_preview: function (range, iframeRect) {
      this.selection_preview_rects = Array.from(range.getClientRects())
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => ({
          left: `${iframeRect.left + rect.left}px`,
          top: `${iframeRect.top + rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }));
    },
    hide_toolbar: function (preserveSelection = false) {
      if (!preserveSelection) this.selection_active = false;
      this.toolbar_left = -999;
      if (!preserveSelection) this.clear_selection_preview();
    },
    show_toolbar: function (rect, iframe_rect) {
      if (!this.settings.notes_enabled || !this.settings.show_selection_toolbar) return;
      console.log("show toolbar at rect", rect, " from iframe rect", iframe_rect)
      const preferredLeft = rect.left + iframe_rect.x;
      const top = rect.top + iframe_rect.y;
      const bottom = rect.bottom + iframe_rect.y;
      this.toolbar_left = 8;
      this.toolbar_top = bottom + 12;
      this.$nextTick(() => {
        const toolbar = this.$refs.selectionToolbar;
        if (!toolbar || !this.settings.notes_enabled || !this.settings.show_selection_toolbar) return;
        const { width, height } = toolbar.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - width - 8);
        this.toolbar_left = Math.max(8, Math.min(maxLeft, preferredLeft));
        const bottomClearance = this.menu.show_navbar ? 64 : 8;
        const fitsAbove = top >= (height + 12 + 8);
        const fitsBelow = bottom + 12 + height <= window.innerHeight - bottomClearance;
        // 触屏设备（如 iOS Safari）的系统文字菜单固定出现在选区上方且无法关闭，工具栏改为优先放在下方，避免两者重叠。
        const preferBelow = window.matchMedia?.('(pointer: coarse)').matches && fitsBelow;
        this.toolbar_top = fitsAbove && !preferBelow
          ? top - height - 12
          : Math.min(window.innerHeight - height - bottomClearance, bottom + 12);
      });
    },
    is_toolbar_visible: function () {
      return this.settings.notes_enabled && this.settings.show_selection_toolbar && this.toolbar_left > 0;
    },
    paragraph_of: function (node, contents) {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      return element.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div') || contents.document.body;
    },
    // 整段的 CFI 与原文。按文字边界取范围，段尾评论气泡不会进入引用，也不会改变段落 CFI。
    paragraph_location: function (paragraph, contents) {
      const walker = contents.document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement.closest('.comment-icon, script, style')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      if (!nodes.length) return {};
      const paragraphRange = contents.document.createRange();
      paragraphRange.setStart(nodes[0], 0);
      paragraphRange.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].length);
      return {
        paragraph_cfi: contents.cfiFromRange(paragraphRange),
        paragraph_quote_text: nodes.map(node => node.textContent).join('').trim(),
      };
    },
    paragraph_for_range: function (range, contents) {
      // 跨段选区的评论归属最后一个段落；真实选区仍由 cfi / quote_text 保留。
      const paragraph = this.paragraph_of(range.endContainer, contents);
      return {
        ...this.paragraph_location(paragraph, contents),
        multi_paragraph: paragraph !== this.paragraph_of(range.startContainer, contents),
      };
    },
    on_select_content: function (cfiRange, contents) {
      console.log("on selectd", cfiRange, contents)
      this.is_handlering_selected_content = true;

      // 找到选中的元素，并上溯到 P 或者 Hx 对象
      const range = this.rendition.getRange(cfiRange) || contents.range(cfiRange);
      const start = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
      const p = start.closest('p, h1, h2, h3, h4, h5, h6') || start;
      console.log("selected elem =", p);

      // 遍历toc，查找最近的章节名称
      // 然后基于章节名的位置，计算选中段落是第几个，作为ID
      const cfi = new ePub.CFI(p, contents.cfiBase);
      const toc = this.find_toc(cfi, contents);
      console.log("cfi = ", cfi, "toc =", toc);

      // 段落序号只给听书「从这里听」兜底匹配用；算不出来也不能挡住工具栏。
      let segment_id = 0;
      try {
        segment_id = toc.is_fallback
          ? Math.max(0, Array.from(toc.elem.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).indexOf(p))
          : this.count_distinct_between(toc.elem, p);
      } catch (error) {
        console.warn('Candle Reader paragraph index could not be computed:', error);
      }

      this.selected_location = {
        client_id: createClientId(),
        toc: toc,
        cfi: String(cfiRange),
        ...this.paragraph_for_range(range, contents),
        quote_text: range.toString().trim(),
        contents: contents,
        segment_id: segment_id
      }

      this.selection_active = true;
      // 把 toolbar 移动到实际选区附近。
      const view = this.rendition.views()._views.filter( view => { return view.index == contents.sectionIndex})[0]
      // 蓝色选区底色只配合我们的工具栏使用（工具栏和编辑框打开时保持选区可见）；工具栏关闭时只留系统原生选区。
      if (this.settings.notes_enabled && this.settings.show_selection_toolbar) this.update_selection_preview(range, view.iframe.getBoundingClientRect());
      this.show_toolbar(range.getBoundingClientRect(), view.iframe.getBoundingClientRect());
    },
    on_keyup: function (e) {
      if (e.key === 'Escape' && this.is_toolbar_visible()) {
        this.hide_toolbar();
        this.restore_reader_focus();
        return;
      }
      const target = e.target;
      if (target?.matches?.('input, textarea, select') || target?.isContentEditable) return;
      const c = e.keyCode || e.which;
      // Left & Up
      if (c == 37 || c == 38) {
        this.suspend_audiobook_follow();
        this.rendition.prev();
      }
      // Right & Down
      if (c == 39 || c == 40) {
        this.suspend_audiobook_follow();
        this.rendition.next();
      }
    },
    on_wheel: function (e) {
      // ponytail: window 级唯一监听；状态守卫而非按需挂/卸。scrolled 模式让浏览器原生滚动生效；
      // 面板/dialog 内滚动交还给它们自己；Ctrl/⌘/Alt 留给浏览器缩放。
      if (!this.settings.wheel_paging) return;
      if (this.settings.flow !== 'paginated') return;
      if (!this.rendition) return;
      if (this.menu.current_panel !== 'hide') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && t.closest && (
        t.closest('.v-bottom-sheet') ||
        t.closest('.v-overlay') ||
        t.closest('.v-dialog') ||
        t.closest('.v-menu')
      )) return;

      // 累积 deltaY：trackpad 一次只发 ~1-10，普通滚轮一次发 ~100；阈值 30 居中，取中防一次滑动翻多页
      this.wheel_acc = (this.wheel_acc || 0) + e.deltaY;
      if (Math.abs(this.wheel_acc) < 30) return;

      e.preventDefault();
      this.suspend_audiobook_follow();
      this.rendition[this.wheel_acc > 0 ? 'next' : 'prev']();
      this.wheel_acc = 0;
    },
    debug_click: function (x, y, width, height) {
      console.log("click at", x, y, width, height);
      if (!this.is_debug_click) return;

      x = x - 10;
      y = y - 10;
      const dotDiv = document.createElement('div');
      dotDiv.classList.add('dot');
      dotDiv.style.left = `${x}px`;
      dotDiv.style.top = `${y}px`;

      document.body.appendChild(dotDiv);

      // 为每个点设置3秒后缓慢消失的效果
      setTimeout(() => {
        document.body.removeChild(dotDiv);
      }, 2000);
    },
    debug_signals: function () {
      if (!this.is_debug_signal) return;
      var signals = ["added", "attach", "attached", "axis", "changed", "detach", "displayed", "displayerror", "expand", "hidden", "layout", "linkClicked", "loaderror", "locationChanged", "markClicked", "openFailed", "orientationchange", "relocated", "removed", "rendered", "resize", "resized", "scroll", "scrolled", "selected", "selectedRange", "shown", "started", "updated", "writingMode", "mouseup", "mousedown", "mousemove", "click", "touchend", "touchstart", "touchmove"]
      signals.forEach(sig => {
        this.rendition.on(sig, (e) => {
          this.alert_msg = sig;
          console.log("rendition signal:", sig, e);
        })
      });
    },
    init_listeners: function () {
      document.addEventListener('keyup', this.on_keyup);
      document.addEventListener('touchmove', this.block_page_drag, { passive: false });
      this.rendition.on('keyup', this.on_keyup);
      this.rendition.on('click', this.on_click_content);
      this.rendition.on('selected', this.on_select_content);
      this.rendition.on('locationChanged', this.on_location_changed);
      this.rendition.on('mousedown', this.on_mousedown);
      this.rendition.on('mouseup', this.on_mouseup);
      this.rendition.on('resized', this.on_resized);
      // 滚轮翻页：iframe 内的 wheel 不会自动冒泡到 parent.window（需 iframe 先被用户激活），
      // 挂到每个渲染出的 iframe.contentDocument 上，每次 rendered 触发再覆盖新 iframe
      this.rendition.on('rendered', this.bind_iframe_wheel);
      // 添加全屏变化事件监听
      document.addEventListener('fullscreenchange', this.on_fullscreen_change);
      document.addEventListener('webkitfullscreenchange', this.on_fullscreen_change);
      document.addEventListener('mozfullscreenchange', this.on_fullscreen_change);
      document.addEventListener('MSFullscreenChange', this.on_fullscreen_change);
      this.debug_signals();
    },
    bind_iframe_wheel: function () {
      // rendered 回调在不同 epub.js 版本里 shape 不一（Contents 没 iframe 字段）；
      // 直接 DOM 查 #reader 下所有 iframe，更可靠。连续模式下多 iframe 也覆盖。
      document.querySelectorAll('#reader iframe').forEach(iframe => {
        const doc = iframe.contentDocument;
        if (!doc || doc.__candle_wheel_bound) return;
        doc.__candle_wheel_bound = true;
        doc.addEventListener('wheel', this.on_wheel, { passive: false });
      });
    },
    // iOS Safari 上纵向拖动会带着整页回弹并收起/展开地址栏，可视高度一变正文就重新排版，看起来像在滚动加载。
    // 左右翻页模式下拦掉阅读区域外框（顶栏、底栏、正文四周）的原生拖动。正文 iframe 里不拦：
    // iOS 拖动选区两端的手柄靠的就是原生拖动；整页不动由 html/body 固定定位保证。
    block_page_drag: function (event) {
      if (this.settings.flow !== 'paginated' || event.touches?.length > 1) return;
      if (!event.target?.closest?.('#main, .v-app-bar, .v-bottom-navigation')) return;
      if (event.cancelable) event.preventDefault();
    },

    init_themes: function () {
      console.log("load themes from:", this.themes_css)
      // 注册所有主题 id（纯色命中 themes.css 的同名 class；图片皮肤的样式由 apply_theme 动态注入）
      THEMES.forEach(t => this.rendition.themes.register(t.id, this.themes_css));
      this.apply_theme(this.settings.theme);
    },
    on_resized: function () {
      // 渲染器大小调整完成后的处理
      console.log('Reader resized');
      // 横竖屏/窗口尺寸变化时，图片皮肤切换竖版/横版大图
      this.apply_skin_background();
      // 强制重新渲染当前页面，解决缩放后卡住问题
      try {
        if (this.rendition && this.book) {
          // 获取当前位置
          const currentLocation = this.rendition.currentLocation();
          if (currentLocation && currentLocation.start && currentLocation.start.cfi) {
            // 重新渲染当前位置
            this.rendition.display(currentLocation.start.cfi);
          } else {
            // 如果获取不到位置，重新渲染当前章节
            this.rendition.display();
          }
        }
      } catch (error) {
        console.error('Error during resize re-render:', error);
      }
    },
    on_fullscreen_change: function () {
      // 全屏状态变化时的处理
      console.log('Fullscreen state changed');
      // 强制重新渲染当前页面，解决全屏切换后卡住问题
      try {
        if (this.rendition && this.book) {
          // 延迟一下，确保DOM已经更新
          setTimeout(() => {
            // 获取当前位置
            const currentLocation = this.rendition.currentLocation();
            if (currentLocation && currentLocation.start && currentLocation.start.cfi) {
              // 重新渲染当前位置
              this.rendition.display(currentLocation.start.cfi);
            } else {
              // 如果获取不到位置，重新渲染当前章节
              this.rendition.display();
            }
          }, 200);
        }
      } catch (error) {
        console.error('Error during fullscreen re-render:', error);
      }
    },
    on_location_changed: function (loc) {
      // 处理当前显示的章节，确保章节标题正确更新
      try {
        // 使用当前位置的 CFI 直接查找章节
        const startCFI = new ePub.CFI(loc.start);
        const contents_list = this.rendition.getContents();

        // 连续翻页模式下会同时渲染多章，必须取「视口起始章节」对应的 contents
        // （loc.index 是该 section 的 spine 序号），否则会误用第一个渲染的 iframe，
        // 导致 chapter_name 错位、summary 取到隔壁章。
        const contents = contents_list.find(c => c.sectionIndex === loc.index);
        if (!contents) {
          return;
        }

        const toc = this.find_toc(startCFI, contents);
        if (toc) {
          this.current_toc_title = toc.label;
          this.current_toc = toc;

          // 只有当章节标题实际变化时，才重新加载评论，避免不必要的 API 请求
          if (this.last_toc_label !== toc.label) {
            this.load_comments_summary(contents, toc);
            this.load_chapter_annotations(toc.label.trim());
            this.last_toc_label = toc.label;
          }
        }
      } catch (error) {
        console.error('Error in on_location_changed:', error);
      }
    },
    // 段尾气泡：显示归属本段的公开评论数量，点击进入本段评论。
    load_comments_summary: function (contents, toc) {
      if (!this.comments_enabled || !this.annotation_repository) return;
      const request = this.comments_request;
      if (toc === undefined) {
        console.log("!! 加载评论数量错误，章节信息为空")
        return
      }

      if (toc.load_time !== undefined) {
        const ms = new Date() - toc.load_time;
        if (ms < this.comments_refresh_time) {
          return;
        }
      }

      toc.load_time = new Date();
      return this.annotation_repository.summary({ chapter: toc.label.trim() }).then(items => {
        if (!this.comments_enabled || request !== this.comments_request) return;
        toc.summary = items;
        this.add_comment_icons(contents, toc);
      }).catch(function (error) {
        console.error('加载评论数量出现错误：', error);
      });
    },
    add_comment_icons: function (contents, toc) {
      if (!this.comments_enabled || !contents) return;
      (toc.summary || []).forEach(item => {
        const cfi = String(item.paragraph_cfi || '');
        // 只处理属于这个正文文档的段落。
        if (!item.count || !cfi.includes(contents.cfiBase)) return;
        try {
          const range = contents.range(cfi);
          if (range) this.add_icon_into_paragraph(contents, this.paragraph_of(range.endContainer, contents), item, toc);
        } catch (error) {
          console.warn('Candle Reader comment bubble could not be placed:', cfi, error);
        }
      });
    },
    add_icon_into_paragraph: function (contents, elem, item, toc) {
      // 检查是否已经添加了评论图标，避免重复添加
      if (elem.querySelector('.comment-icon')) {
        return;
      }

      // 创建评论气泡：气泡即容器，评论数作为内容天然居中
      const doc = contents.document;
      const commentContainer = doc.createElement("div");
      commentContainer.className = 'comment-icon';
      const commentCount = doc.createElement("span");
      commentCount.className = 'comment-count';
      commentCount.textContent = String(item.count);
      commentContainer.appendChild(commentCount);

      // 将评论组件添加到段落末尾（内联跟随文字）
      elem.appendChild(commentContainer);

      commentContainer.addEventListener('click', (event) => {
        event.stopPropagation();
        this.open_comments('paragraph', { toc, contents, ...this.paragraph_location(elem, contents), paragraph_cfi: String(item.paragraph_cfi) });
      });
    },
    refresh_comment_icons: function () {
      this.comments_request++;
      if (!this.rendition) return;
      for (const contents of this.rendition.getContents()) {
        contents.document.querySelectorAll('.comment-icon').forEach(icon => icon.remove());
      }
      if (this.comments_enabled && this.current_toc?.elem) {
        delete this.current_toc.load_time;
        const contents = this.rendition.getContents().find(c => c.document === this.current_toc.elem.ownerDocument);
        if (contents) this.load_comments_summary(contents, this.current_toc);
      }
    },
    retryLoad: function() {
      // 重置状态并重新加载电子书
      try {
        // 立即关闭对话框并显示加载覆盖层
        this.showTimeoutDialog = false;

        // 确保覆盖层显示
        setTimeout(() => {
          this.loading = true;
        }, 50);

        // 停掉还在进行的上一次加载，避免两份正文叠在一起
        try { this.rendition?.destroy(); this.book?.destroy(); } catch (error) { /* noop */ }

        // 重新初始化并加载电子书
        this.book = ePub(this.book_url);

        this.rendition = this.book.renderTo("reader", {
          manager: "continuous",
          flow: this.settings.flow,
          width: "100%",
          height: "100%",
        });

        this.init_listeners();
        this.init_themes();

        this.start_load_timer();

        // 使用 book_url 作为唯一标识，为每个书籍存储独立的阅读位置
        const positionKey = `lastReadPosition_${this.book_url}`;

        this.book.ready.then(() => {
          const savedPosition = localStorage.getItem(positionKey);
          const target = savedPosition || this.display_url;
          return target ? this.rendition.display(target) : this.rendition.display();
        })
        .then(this.on_book_loaded)
        .catch(this.on_book_load_failed);

        // 监听 relocated 事件，保存当前阅读位置，使用 book_url 作为唯一标识
        this.rendition.on('relocated', (location) => {
          localStorage.setItem(positionKey, location.start.cfi);
        });
      } catch (error) {
        this.on_book_load_failed(error);
      }
    },
    // 超过 LOAD_TIMEOUT_MS 仍未显示正文时提示「加载较慢」，但不中断加载；加载完成后自动关闭提示。
    start_load_timer: function () {
      clearTimeout(this.loadingTimeout);
      this.load_failed = false;
      this.loadingTimeout = setTimeout(() => {
        if (this.loading) {
          console.warn('电子书加载较慢，显示提示框');
          this.showTimeoutDialog = true;
        }
      }, LOAD_TIMEOUT_MS);
    },
    on_book_loaded: function () {
      clearTimeout(this.loadingTimeout);
      this.loading = false;
      this.showTimeoutDialog = false;
    },
    on_book_load_failed: function (error) {
      clearTimeout(this.loadingTimeout);
      console.error('加载电子书失败:', error);
      this.loading = false;
      this.load_failed = true;
      this.showTimeoutDialog = true;
    },
  },
  mounted: function () {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = this.themes_css;
    document.head.appendChild(link);

    // 从localStorage加载设置；用默认 settings 做底，避免老存档缺少新增 key 时变成 undefined（导致 wheel_paging 等判断失灵）
    const savedSettings = localStorage.getItem('readerSettings');
    if (savedSettings) {
      const defaults = this.$options.data().settings;
      const saved = JSON.parse(savedSettings);
      this.settings = Object.assign({}, defaults);
      // ponytail: Object.assign 会用 undefined 覆盖默认；显式跳过 undefined 值
      for (const k in saved) {
        if (saved[k] !== undefined) this.settings[k] = saved[k];
      }
      Object.assign(this.settings, normalizeNoteSettings(saved));
    }
    this.initialize_annotations();
    this.load_user();
    this.is_debug_signal = this.debug;
    this.is_debug_click = this.debug;

    this.start_load_timer();
    this.loading = true;

    this.book = ePub(this.book_url);

    this.rendition = this.book.renderTo("reader", {
      manager: "continuous",
      flow: this.settings.flow,
      width: "100%",
      height: "100%",
      //snap: true
    });

    this.book.loaded.metadata.then(metadata => {
      console.log(metadata);
      this.book_meta = metadata;
      this.book_title = metadata.title;
    })
    .catch(error => {
      console.error('加载书籍元数据失败:', error);
    });

    // 加载目录
    this.book.loaded.navigation.then(nav => {
      this.toc_items = nav.toc
    })
    .catch(error => {
      console.error('加载目录失败:', error);
    });

    this.init_listeners();
    this.init_themes();

    // 使用 book_url 作为唯一标识，为每个书籍存储独立的阅读位置
    const positionKey = `lastReadPosition_${this.book_url}`;

    this.rendition.on('relocated', (location) => {
      localStorage.setItem(positionKey, location.start.cfi);
    });

    this.book.ready.then(() => {
      const savedPosition = localStorage.getItem(positionKey);
      const target = savedPosition || this.display_url;
      return target ? this.rendition.display(target) : this.rendition.display();
    })
    .then(() => {
      this.on_book_loaded();

      // 初始化亮度、字体大小，并在正文渲染后再应用一次主题（确保背景图/透明/文字色就位）
      const brightness = this.settings.brightness / 100;
      document.getElementById('main').style.filter = `brightness(${brightness})`;
      this.rendition.themes.fontSize(this.settings.font_size + 'px');
      this.apply_theme(this.settings.theme);
    })
    .catch(this.on_book_load_failed)
  },
  data: () => ({
    loading: true,
    book: null,
    settings: {
      flow: "paginated",
      // flow: "scrolled",
      font_size: 18,
      line_height: 1.5,
      letter_spacing: 0,
      brightness: 100,
      theme: "white",
      theme_mode: "day",
      theme_day: "white",
      theme_night: "grey",
      show_comments: true,
      notes_enabled: true,
      show_selection_toolbar: true,
      notes_settings_version: 2,
      paging_control: "mouse_and_keyboard",
      wheel_paging: true,
    },

    wide_screen: 1000, // 宽屏尺寸
    comments_refresh_time: 10 * 60 * 100, // 10min

    user: null, // 当前读者，由宿主回调提供；游客为 null
    book_title: "",
    book_meta: null,
    alert_msg: "秉烛夜读",
    rendition: null,
    auto_close: false,
    menu: {
      show_navbar: true,
      current_panel: "hide",
      value: "",
      panels: {
        toc: false,
        settings: false,
        annotations: false,
        ai: false,
      }
    },
    theme_mode: "day",
    toc_items: [],
    panel_trigger: null,
    panel_closing: null,
    panel_entry_ref: 'panelEntryAnnotations',
    comments_request: 0,
    annotation_repository: null,
    annotation_chapter_request: 0,
    annotation_saving: false,
    annotation_editor_open: false,
    annotation_editor_location: null,
    annotation_editor_record: null, // 正在编辑的已有评论
    annotation_editor_type: 'note', // note | book_comment
    annotation_editor_content: "",
    annotation_editor_error: "",
    annotation_editor_private: false,
    comment_paragraph: null, // 「本段评论」当前所指的段落
    selection_preview_rects: [],
    annotation_feedback_visible: false,
    annotation_feedback_message: "",
    annotation_feedback_error: false,
    rendered_annotations: [],
    rendered_annotation_ids: new Set(),
    selected_location: {}, // 选中内容的位置

    current_toc_title: "",
    current_toc: null, // 当前阅读的章节对象
    current_toc_progress: "",
    last_toc_label: "", // 上一次的章节标题，用于检测章节变化

    toolbar_left: -999,
    toolbar_top: 0,

    is_debug_signal: false,
    is_debug_click: false,
    is_handlering_selected_content: false,
    mouse_down_point: null,
    selection_active: false, // epub.js 报告选中文字后为 true，取消选中或收起工具栏后复位
    check_if_selected_content: false,
    showTimeoutDialog: false,
    load_failed: false, // 区分「加载较慢」与「加载失败」
    show_theme_dialog: false,
    audiobook_open: false,
  })
}
</script>

<style scoped>
.theme-group-label { font-size: 13px; color: #888; margin: 4px 0 8px; }
.theme-group-label:not(:first-child) { margin-top: 16px; }
.theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.theme-card {
  position: relative; height: 84px; border-radius: 10px; padding: 10px;
  box-sizing: border-box; cursor: pointer; overflow: hidden;
  background-size: cover; background-position: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.theme-card.active { outline: 2px solid #e5392f; }
.theme-sample { font-size: 13px; line-height: 1.4; }
.theme-badge {
  position: absolute; left: 8px; bottom: 8px;
  background: #e5392f; color: #fff; font-size: 10px;
  padding: 1px 6px; border-radius: 3px;
}
.theme-check {
  position: absolute; top: 6px; right: 6px;
  color: #2e9b4e; /* mdi-check-circle 自带圆形，加白色描边在深/浅背景上都清晰 */
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95));
}
.theme-name { text-align: center; font-size: 13px; padding-top: 5px; }
</style>

<style>
.dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: rgba(255, 0, 0, 0.6);
  position: absolute;
  transition: opacity 1s ease-out;
  z-index: 999;
}

#comments-toolbar {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 999;
  width: max-content;
  max-width: calc(100vw - 16px);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 3px 8px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.selection-toolbar-actions {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: inherit;
  overflow-x: auto;
  scrollbar-width: thin;
}

#comments-toolbar .selection-toolbar-action {
  flex: 0 0 auto;
  min-width: 0;
  width: auto;
  height: 36px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  color: inherit;
  transition: background-color 140ms ease;
}

#comments-toolbar .v-btn__content {
  display: flex;
  flex-direction: row;
  gap: 4px;
}

#comments-toolbar .selection-toolbar-action span {
  white-space: nowrap;
  line-height: 1.3;
}

#comments-toolbar .selection-toolbar-action:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
  background: rgba(var(--v-theme-primary), 0.08);
}

@media (prefers-reduced-motion: reduce) {
  #comments-toolbar .selection-toolbar-action { transition: none; }
}

.selection-preview {
  position: fixed;
  z-index: 998;
  pointer-events: none;
  background: rgba(56, 121, 219, 0.34);
  border-radius: 2px;
}

.annotation-editor-dialog.v-dialog > .v-overlay__content {
  margin: 16px;
  width: calc(100% - 32px);
}

.annotation-editor-dialog .v-overlay__content > .annotation-editor-card.v-card {
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
}

.annotation-editor-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 12px 24px;
}

.annotation-editor-header h2 { font-size: 20px; font-weight: 600; line-height: 1.5; }
.annotation-editor-dialog .annotation-editor-card.v-card > .annotation-editor-body.v-card-text { padding: 4px 24px 0; overflow-y: auto; }
.annotation-reference-heading { display: flex; gap: 16px; align-items: baseline; margin-bottom: 8px; font-size: 12px; line-height: 1.5; }
.annotation-reference-heading > :first-child { flex: 0 0 auto; font-weight: 500; }
.annotation-reference-chapter { min-width: 0; margin-left: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: rgba(var(--v-theme-on-surface), 0.7); }

.annotation-editor-quote {
  max-height: 112px;
  margin: 0;
  overflow-y: auto;
  padding: 12px 14px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  color: rgb(var(--v-theme-on-surface));
  border-left: 2px solid rgba(var(--v-theme-on-surface), 0.28);
  border-radius: 0 8px 8px 0;
  font-family: "Songti SC", "Noto Serif CJK SC", serif;
  font-size: 14px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.annotation-editor-hint { margin: 8px 0 0; font-size: 12px; line-height: 1.6; color: rgba(var(--v-theme-on-surface), 0.7); }
.annotation-editor-input { margin-top: 22px; }
.annotation-editor-input .v-field { border-radius: 10px; background: rgb(var(--v-theme-background)); }
.annotation-editor-input textarea { font-size: 15px; line-height: 1.7; }
.annotation-editor-footer { flex: 0 0 auto; padding: 16px 24px; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1); }
.annotation-visibility-row { display: flex; align-items: center; gap: 8px; }
.annotation-visibility-label { min-width: 0; font-size: 13px; line-height: 1.5; cursor: pointer; }
.annotation-visibility-label-disabled { opacity: 0.6; cursor: default; }
.annotation-visibility { flex: 0 0 auto; --v-input-control-height: 36px; }
.annotation-editor-card .annotation-editor-actions { gap: 8px; padding: 14px 0 0; min-height: 0; }
.annotation-editor-actions .v-btn { min-width: 80px; height: 40px; border-radius: 8px; letter-spacing: 0; }
.annotation-editor-card .v-btn:focus-visible, .annotation-editor-quote:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }

@media (max-width: 360px) {
  .annotation-editor-header { padding-inline: 16px 12px; }
  .annotation-editor-dialog .annotation-editor-card.v-card > .annotation-editor-body.v-card-text,
  .annotation-editor-footer { padding-inline: 16px; }
}

/* 阅读器占满整个页面：页面本身固定不滚动，iOS 上拖动正文时整页不会回弹，地址栏也不会收起导致正文重新排版。 */
html, body {
  position: fixed;
  inset: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

#main {
  height: 100%;
  width: 100%;
  position: absolute;
}

#reader {
  top: 24px;
  height: calc(100% - 24px); /* 24px top bar only */
  width: 100%;
  position: absolute;
}

#status-bar-top {
  height: 24px;
  width: 100%;
  padding: 0 8px;
  top: 0;
  left: 0;
  z-index: 1;
  font-size: 12px;
  position: absolute;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#status-bar-bottom {
  height: 30px;
  width: 100%;
  bottom: 0;
  left: 0;
  z-index: 1;
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 8px;
}

.progress-bar-container {
  width: 100%;
  height: 4px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary-color, #1976d2);
  transition: width 0.3s ease;
  border-radius: 2px;
}

.fixed {
  position: fixed !important;
}

/* 评论抽屉占底部菜单上方可用区域的 90%，顶部 10% 留给阅读上下文与点击收起。 */
.v-bottom-sheet.annotation-bottom-sheet > .v-bottom-sheet__content.v-overlay__content { height: 90%; max-height: 90%; }
.annotation-sheet-body { height: 100%; min-height: 0; }
.annotation-editor-book-hint { margin: 0 0 4px; }

/* 桌面端改为覆盖式侧边栏：目录在左，评论和设置在右；不压缩正文宽度，避开顶部栏，底部菜单保持可用。 */
@media (min-width: 850px) {
  .v-bottom-sheet.reader-side-left > .v-bottom-sheet__content.v-overlay__content,
  .v-bottom-sheet.reader-side-right > .v-bottom-sheet__content.v-overlay__content {
    align-self: flex-end;
    height: calc(100% - 48px) !important;
    max-height: none !important;
    margin: 0;
    overflow-y: auto;
    border-radius: 0;
    background: rgb(var(--v-theme-surface));
  }
  .v-bottom-sheet.reader-side-right > .v-bottom-sheet__content.v-overlay__content { left: auto; right: 0; width: 420px; border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
  .v-bottom-sheet.reader-side-left > .v-bottom-sheet__content.v-overlay__content { left: 0; right: auto; width: 300px; border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
  .v-bottom-sheet.settings-bottom-sheet.reader-side-right > .v-bottom-sheet__content.v-overlay__content { width: 380px; }
}

/* 小屏会同时显示目录、主题、评论等入口；覆盖 Vuetify 的按钮最小宽度，避免两端入口被裁掉。 */
.v-bottom-navigation .v-bottom-navigation__content > .v-btn {
  min-width: 0 !important;
  flex: 1 1 0;
  padding-inline: 3px !important;
}

@media (prefers-reduced-motion: reduce) {
  .annotation-bottom-sheet .v-overlay__content,
  .annotation-editor-dialog .v-overlay__content,
  .annotation-feedback .v-snackbar__wrapper {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* 底部安全区填充条：仅占 home indicator 那条（无安全区设备高度为 0，不可见）。
   纯色 background（iOS 安全区只认 background-color）。z-index 低于底部导航(1004)，
   导航显示时被其覆盖、隐藏(display:none)时露出 foot 色，与底图下沿衔接。 */
#safe-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* 底部安全区（home indicator）填充：背景色由 :style 的 foot_color 提供（图片皮肤=底图下沿色）。
     不设 z-index，按 DOM 顺序排在 #main 之前 → 被正文/底图盖住，仅 #main 未铺到的 home indicator
     那条露出 foot 色，故不遮挡正文。给足够高度以适配各机型安全区（多余部分被 #main 盖住不可见）。
     底部导航(z 1004)显示时盖住此条，隐藏(display:none)时露出 foot 色。 */
  height: 160px;
  pointer-events: none;
}

/* 隐藏底部导航时（非 active）直接移除：Vuetify 默认只是 translateY 下移，但在 iOS
   （viewport-fit=cover）下其 position:fixed;bottom:0 的背景仍留在 home indicator 安全区，
   表现为底部残留 surface 深绿。display:none 彻底移除，使底部安全区露出 body 的主题底色。 */
.v-bottom-navigation:not(.v-bottom-navigation--active) {
  display: none !important;
}
</style>
