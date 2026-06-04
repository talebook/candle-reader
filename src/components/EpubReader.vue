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
      <v-btn icon title="更多选项"> <v-icon>mdi-dots-vertical</v-icon> </v-btn>
    </v-app-bar>

    <!-- 底部菜单 -->
    <v-bottom-navigation v-model="menu.value" :active="menu.show_navbar" z-index="2599">
      <v-btn value="toc" @click="set_menu('toc')">
        <v-icon>mdi-book-open-variant-outline</v-icon>
        <span>目录</span>
      </v-btn>

      <v-btn @click="switch_theme">
        <v-icon>{{ switch_theme_icon }}</v-icon>
        <span>{{ switch_theme_text }}</span>
      </v-btn>

      <v-btn value="settings" @click="set_menu('settings')">
        <v-icon>mdi-cog</v-icon>
        <span>设置</span>
      </v-btn>

      <v-btn value="more" @click="set_menu('more')">
        <v-badge color="error" :content="unread_count" v-if="unread_count">
          <v-icon>mdi-account-circle-outline</v-icon>
        </v-badge>
        <v-icon v-else>mdi-account-circle-outline</v-icon>
        <span>用户</span>
      </v-btn>

      <v-btn value="ai" @click="set_menu('ai')">
        <v-icon>mdi-face-man-shimmer</v-icon>
        <span>AI</span>
      </v-btn>

    </v-bottom-navigation>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.settings" contained persistent z-index="234">
      <settings :settings="settings" @update="update_settings" @open-themes="open_theme_dialog"></settings>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.toc" contained close-on-content-click  z-index="234">
      <book-toc ref="bookTocComponent" :meta="book_meta" :toc_items="toc_items" :current-chapter="current_toc" @click:select="on_click_toc"></book-toc>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.more" contained z-index="234">
      <guest v-if="!user" @login="on_login_user"></guest>
      <user-center v-else :messages="comments" :user="user" @update="on_login_user" @logout="user=null"></user-center>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.comments" contained  z-index="234">
      <book-comments :login="is_login" :comments="comments" @close="set_menu('hide')"
        @login="set_menu('more')" @add_review="on_add_review"></book-comments>
    </v-bottom-sheet>

    <v-bottom-sheet class="fixed mb-14" max-height="90%" v-model="menu.panels.ai" contained z-index="234">
      <v-card title="开发中"></v-card>
    </v-bottom-sheet>

    <!-- 浮动工具栏 -->
    <div id="comments-toolbar" :style="`left: ${toolbar_left}px; top: ${toolbar_top}px;`">
      <v-toolbar density="compact" border dense floating elevation="10" rounded>
        <v-btn @click="on_click_toolbar_comments">发段评</v-btn>
        <v-divider vertical></v-divider>
        <v-btn>从这里听</v-btn>
        <v-divider vertical></v-divider>
        <v-btn>复制</v-btn>
        <v-divider vertical></v-divider>
        <v-btn>反馈</v-btn>
      </v-toolbar>
    </div>

    <!-- 阅读界面 -->
    <v-main id='main' class="pa-0">
      <v-overlay v-model="loading" z-index="auto" class="align-center justify-center" persistent>
        <v-progress-circular indeterminate size="64" color="primary"></v-progress-circular>
      </v-overlay>

      <!-- 加载超时提示框 -->
      <v-dialog v-model="showTimeoutDialog" max-width="500px">
        <v-card>
          <v-card-title class="text-h5 text-center">加载超时</v-card-title>
          <v-card-text class="text-center">
            电子书加载超时，可能是网络问题或文件格式不支持。
          </v-card-text>
          <v-card-actions class="justify-center">
            <v-btn color="primary" variant="text" @click="showTimeoutDialog = false">
              关闭
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
import Settings from './Settings.vue'
import BookToc from './BookToc.vue'
import Guest from './Guest.vue'
import UserCenter from './UserCenter.vue'
import BookComments from './BookComments.vue'
import { THEMES, getTheme } from '@/themes'

export default {
  name: 'EpubReader',
  components: {
    Settings,
    BookToc,
    Guest,
    UserCenter,
    BookComments
  },
  props: ['book_url', 'display_url', 'debug', 'themes_css'],
  computed: {
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
    set_menu: function (target_menu_panel) {
      var target = target_menu_panel;
      if (this.menu.current_panel == target) {
        if (this.menu.panels[target] === true) {
          target = 'hide';
        }
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
      this.rendition.display(item.id);
    },
    on_mousedown: function (mouse_event) {
      this.mouse_down_time = new Date();
    },
    on_mouseup: function (mouse_event) {
      const t = new Date() - this.mouse_down_time;
      if (t > 600) {
        this.check_if_selected_content = true;
      } else {
        this.check_if_selected_content = false;
      }
    },
    on_click_content: function (event) {
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
          this.rendition.prev();
        }
      } else if (x > width * (N-1) / N || (is_mobile && y > height * (N-1) / N)) {
        // 点击右侧，往后翻页
        if (!is_keyboard_only) {
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
    find_toc: function (search_cfi, contents) {
      const cfi = new ePub.CFI(search_cfi.toString()); // 强制转成标准格式
      const section = this.book.spine.get(contents.sectionIndex);

      // 获取当前所属的章节（可能是一个包含N个小节的卷）
      const toc = this.find_same_href_in_toc_tree(this.toc_items, section.href);
      console.log("got spine href in toc:", toc)
      if (toc === undefined) {
        return;
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
      while (end.parentElement != start_elem.parentNode) {
        end = end.parentElement;
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
    hide_toolbar: function () {
      this.toolbar_left = -999;
    },
    show_toolbar: function (rect, iframe_rect) {
      console.log("show toolbar at rect", rect, " from iframe rect", iframe_rect)
      const toolbar = document.getElementById('comments-toolbar');
      this.toolbar_left = rect.left + iframe_rect.x;

      const top = rect.top + iframe_rect.y;
      const bottom = rect.bottom + iframe_rect.y;
      if (top >= (toolbar.offsetHeight + 64)) {
        this.toolbar_top = (top - toolbar.offsetHeight - 12);
      } else {
        this.toolbar_top = (bottom + 12);
      }
    },
    is_toolbar_visible: function () {
      return (this.toolbar_left > 0);
    },
    on_select_content: function (cfiRange, contents) {
      console.log("on selectd", cfiRange, contents)
      this.is_handlering_selected_content = true;

      // 找到选中的元素，并上溯到 P 或者 Hx 对象
      const range = this.rendition.getRange(cfiRange);
      var p = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
      while (p.nodeName.toUpperCase() != "P" && p.nodeName.toUpperCase()[0] != "H") {
        p = p.parentElement;
      }
      console.log("selected elem =", p);

      // 遍历toc，查找最近的章节名称
      // 然后基于章节名的位置，计算选中段落是第几个，作为ID
      const cfi = new ePub.CFI(p, contents.cfiBase);
      const toc = this.find_toc(cfi, contents);
      console.log("cfi = ", cfi, "toc =", toc);

      // 基于cfi的数字快速计算
      // const segment_id = cfi.path.steps[1].index - toc.cfi.path.steps[1].index;
      const segment_id = this.count_distinct_between(toc.elem, p);
      console.log("selected segment_id = ", segment_id);

      this.selected_location = {
        toc: toc,
        cfi: cfi,
        contents: contents,
        segment_id: segment_id
      }

      // 把 toolbar 移动到段落附近
      const view = this.rendition.views()._views.filter( view => { return view.index == contents.sectionIndex})[0]
      this.show_toolbar(p.getBoundingClientRect(), view.iframe.getBoundingClientRect());
    },
    on_click_toolbar_comments: function () {
      console.log("点击发表评论按钮", this.selected_location)
      const s = this.selected_location;
      this.hide_toolbar();
      this.show_selected_comments(s.toc, s.segment_id, s.cfi);
    },
    on_keyup: function (e) {
      const c = e.keyCode || e.which;
      // Left & Up
      if (c == 37 || c == 38) {
        this.rendition.prev();
      }
      // Right & Down
      if (c == 39 || c == 40) {
        this.rendition.next();
      }
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
      var signals = ['click', 'selected', 'touchstart', 'touchend', 'touchmove'];
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
      this.rendition.on('keyup', this.on_keyup);
      this.rendition.on('click', this.on_click_content);
      this.rendition.on('selected', this.on_select_content);
      this.rendition.on('locationChanged', this.on_location_changed);
      this.rendition.on('mousedown', this.on_mousedown);
      this.rendition.on('mouseup', this.on_mouseup);
      this.rendition.on('resized', this.on_resized);
      // 添加全屏变化事件监听
      document.addEventListener('fullscreenchange', this.on_fullscreen_change);
      document.addEventListener('webkitfullscreenchange', this.on_fullscreen_change);
      document.addEventListener('mozfullscreenchange', this.on_fullscreen_change);
      document.addEventListener('MSFullscreenChange', this.on_fullscreen_change);
      this.debug_signals();
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
    on_add_review: function (content) {
      const loc = this.comments_location
      const review = {
        book_id: this.book_id,
        chapter_name: loc.toc.label.trim(),
        chapter_id: loc.toc.chapter_id,
        segment_id: loc.segment_id,
        cfi: loc.cfi.toString(),
        content: content,
        type: 1,
      }
      console.log("add review = ", review)

      this.$backend('/api/review/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(review),
      }).then(rsp => {
        if (rsp.err == 'ok') {
          this.comments.push(rsp.data);
          alert("评论成功")
        }
        console.log("add review rsp = ", rsp)
      });
    },
    on_location_changed_old: function (loc) {
      // if (this.review_bid <= 0) return;

      const contents_list = this.rendition.getContents();
      [loc.start, loc.end].forEach(cfi => {
        console.log("handle location ", cfi)
        const spine = this.book.spine.get(cfi);
        const contents = contents_list.filter(c => { return c.cfiBase == spine.cfiBase })[0];

        const target_cfi = new ePub.CFI(cfi)
        const toc = this.find_toc(target_cfi, contents, spine.href);

        this.load_comments_summary(contents, toc);
      })
    },
    on_location_changed: function (loc) {
      // 处理当前显示的章节，确保章节标题正确更新
      try {
        // 使用当前位置的 CFI 直接查找章节
        const startCFI = new ePub.CFI(loc.start);
        const contents_list = this.rendition.getContents();

        // 遍历所有内容，找到匹配的内容项
        for (const contents of contents_list) {
          // 检查当前 CFI 是否属于这个内容项
          try {
            // 直接使用当前位置的 CFI 查找目录
            const toc = this.find_toc(startCFI, contents);

            if (toc) {
              // 无论章节标题是否变化，都强制更新
              // 这是为了确保即使章节标题相同，也能正确更新状态
              this.current_toc_title = toc.label;
              this.current_toc = toc;

              // 只有当章节标题实际变化时，才重新加载评论
              // 这是为了避免不必要的 API 请求
              if (this.last_toc_label !== toc.label) {
                this.load_comments_summary(contents, toc);
                this.last_toc_label = toc.label;
              }
              break;
            }
          } catch (error) {
            // 忽略单个内容项的错误，继续尝试其他内容项
            console.error('Error processing contents:', error);
          }
        }
      } catch (error) {
        console.error('Error in on_location_changed:', error);
      }
    },
    load_comments_summary: function (contents, toc) {
      console.log("load_comments_summary at ", contents, toc)
      if (toc === undefined) {
        console.log("!! 加载章评错误，章节信息为空")
        return
      }

      // TODO 应当增加一个刷新机制
      if (toc.load_time !== undefined) {
        const ms = new Date() - toc.load_time;
        if (ms < this.comments_refresh_time) {
          return;
        }
      }

      toc.load_time = new Date();

      // 查询该章节的评论总数，并保存到toc对象中，然后展示图标
      const chapter_name = toc.label.trim();
      var url = `/api/review/summary?book_id=${this.book_id}&chapter_name=${chapter_name}`;
      this.$backend(url).then(rsp => {
        toc.load_time = new Date();
        toc.summary = {}
        toc.chapter_id = rsp.data.chapter_id;
        rsp.data.list.forEach(item => {
          toc.summary[item.segmentId] = item;
          toc.icons_rendered = false;
        })
      }).catch(function (error) {
        console.error('请求过程中出现错误：', error);
      }).finally(() => {
        this.add_comment_icons(contents, toc);
      });;
    },
    add_comment_icons: function (contents, toc) {
      console.log("添加评论图标和计数器：", toc.label.trim())

      // 如果章评功能关闭，不添加图标
      if (!this.settings.show_comments) {
        return;
      }

      // 确定 segment_id 的最大值
      var max_segment_id = 0;
      for (var idx in toc.summary) {
        if (idx > max_segment_id) {
          max_segment_id = idx
        }
      }

      // 深度优先遍历
      var segment_id = 0;
      var currentNode = toc.elem;

      // 从起始节点开始遍历到结束节点
      while (segment_id <= max_segment_id && currentNode) {
        const node_name = currentNode.nodeName.toUpperCase();
          if (node_name === "P" || node_name[0] === "H") {
            this.add_icon_into_paragraph(contents, currentNode, segment_id, toc)
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

      // 标记已渲染图标
      toc.icons_rendered = true;
    },

    add_icon_into_paragraph: function (contents, elem, segment_id, toc) {
      const state = toc.summary[segment_id];
      if (state === undefined) {
        return;
      }
      console.log("添加评论图标：", segment_id, elem, state)

      // 检查是否已经添加了评论图标，避免重复添加
      if (elem.querySelector('.comment-icon')) {
        return;
      }

      const cfi = new ePub.CFI(elem, contents.cfiBase).toString();
      const count = state.reviewNum;
      const is_hot = state.is_hot ? "hot-comment" : "";

      // 创建评论容器
      const doc = contents.document;
      const commentContainer = doc.createElement("div");
      commentContainer.className = `comment-icon ${is_hot}`;
      commentContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        ${count > 0 ? `<span class="comment-count">${count}</span>` : ''}
      `;

      // 为段落添加相对定位，确保评论图标可以绝对定位
      if (elem.style.position === '' || elem.style.position === 'static') {
        elem.style.position = 'relative';
      }

      // 将评论组件添加到段落末尾
      elem.appendChild(commentContainer);

      commentContainer.addEventListener('click', (event) => {
        event.stopPropagation();
        console.log("点击评论按钮", toc.chapter_id, segment_id, cfi)
        this.show_selected_comments(toc, segment_id, cfi);
      });
    },
    show_selected_comments: function (toc, segment_id, cfi) {
      // 重置状态
      this.comments = [];
      this.comments_location = {
        toc: toc,
        cfi: cfi,
        segment_id: segment_id,
      }

      // ID 不存在的话，说明压根就没评论，不用查询了
      if (toc.chapter_id === undefined) {
        this.set_menu("comments")
        return;
      }
      const url = `/api/review/list?book_id=${this.book_id}&chapter_id=${toc.chapter_id}&segment_id=${segment_id}&cfi=${cfi}`;
      this.$backend(url).then(rsp => {
        this.comments = rsp.data.list;
        this.set_menu("comments")
        // this.set_menu("comments");
      })
    },
    on_login_user: function(user_data) {
      this.user = user_data;
      this.is_login = true;
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

        // 清除可能存在的旧定时器
        clearTimeout(this.loadingTimeout);

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

        // 重新设置超时定时器
        this.loadingTimeout = setTimeout(() => {
          if (this.loading) {
            console.warn('电子书加载超时，显示提示框');
            this.loading = false;
            this.showTimeoutDialog = true;
          }
        }, 10000);

        // 使用 book_url 作为唯一标识，为每个书籍存储独立的阅读位置
        const positionKey = `lastReadPosition_${this.book_url}`;

        this.book.ready.then(() => {
          const savedPosition = localStorage.getItem(positionKey);
          return this.rendition.display(savedPosition || this.display_url);
        })
        .then(() => {
          clearTimeout(this.loadingTimeout);
          // 确保覆盖层隐藏
          this.loading = false;
        })
        .catch(error => {
          clearTimeout(this.loadingTimeout);
          console.error('加载电子书失败:', error);
          // 确保覆盖层隐藏并显示错误对话框
          this.loading = false;
          this.showTimeoutDialog = true;
        });

        // 监听 relocated 事件，保存当前阅读位置，使用 book_url 作为唯一标识
        this.rendition.on('relocated', (location) => {
          localStorage.setItem(positionKey, location.start.cfi);
        });
      } catch (error) {
        console.error('重试加载过程中出现错误:', error);
        // 确保覆盖层隐藏并显示错误对话框
        this.loading = false;
        this.showTimeoutDialog = true;
      }
    },
  },
  mounted: function () {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = this.themes_css;
    document.head.appendChild(link);

    // 从localStorage加载设置
    const savedSettings = localStorage.getItem('readerSettings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings);
      console.log("加载设置：", savedSettings);
    }
    this.is_debug_signal = this.debug;
    this.is_debug_click = this.debug;

    // 添加加载超时机制，10秒后显示提示框
    this.loadingTimeout = setTimeout(() => {
      if (this.loading) {
        console.warn('电子书加载超时，显示提示框');
        this.loading = false;
        this.showTimeoutDialog = true;
      }
    }, 10000);

    this.loading = true;
    const url = `/api/review/me?count=true`;
    this.$backend(url).then(rsp => {
      if (rsp.err == "user.need_login") {
        this.is_login = false;
      } else if (rsp.err == "ok") {
        this.unread_count = rsp.data.count;
      } else if (rsp.err === "network_error") {
        // 处理网络错误，不改变用户登录状态
        console.log('网络错误，无法获取未读消息数，保持当前登录状态');
      }
    })
    .catch(error => {
      console.error('获取未读消息数失败:', error);
    })

    this.$backend(`/api/user/info`).then(rsp => {
      if (rsp.err == "ok") {
        this.user = rsp.data;
      } else if (rsp.err === "network_error") {
        // 处理网络错误，不设置用户信息，保持当前状态
        console.log('网络错误，无法获取用户信息，保持当前状态');
      } else {
        // 其他错误，如用户不存在，设置为未登录
        this.user = null;
      }
    })
    .catch(error => {
      console.error('获取用户信息失败:', error);
    })


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
      const url = `/api/review/book?title=${this.book_title}`;
      this.$backend(url).then(rsp => {
        if (rsp.err == "ok") {
          this.book_id = rsp.data.id;
        }
      })
      .catch(error => {
        console.error('获取书籍ID失败:', error);
      })
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
      return this.rendition.display(savedPosition || this.display_url);
    })
    .then(() => {
      clearTimeout(this.loadingTimeout);
      this.loading = false;

      // 初始化亮度、字体大小，并在正文渲染后再应用一次主题（确保背景图/透明/文字色就位）
      const brightness = this.settings.brightness / 100;
      document.getElementById('main').style.filter = `brightness(${brightness})`;
      this.rendition.themes.fontSize(this.settings.font_size + 'px');
      this.apply_theme(this.settings.theme);
    })
    .catch(error => {
      clearTimeout(this.loadingTimeout);
      console.error('加载电子书失败:', error);
      this.loading = false;
      this.showTimeoutDialog = true;
    })

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
      paging_control: "mouse_and_keyboard",
    },

    wide_screen: 1000, // 宽屏尺寸
    comments_refresh_time: 10 * 60 * 100, // 10min

    user: null,
    is_login: true,
    book_title: "",
    book_meta: null,
    book_id: 0,
    alert_msg: "秉烛夜读",
    rendition: null,
    auto_close: false,
    menu: {
      show_navbar: true,
      current_panel: "hide",
      value: "",
      panels: {
        toc: false,
        more: false,
        settings: false,
        comments: false,
        ai: false,
      }
    },
    theme_mode: "day",
    toc_items: [],
    comments: [],
    comments_location: {}, // 评论内容的位置
    selected_location: {}, // 选中内容的位置

    current_toc_title: "",
    current_toc: null, // 当前阅读的章节对象
    current_toc_progress: "",
    last_toc_label: "", // 上一次的章节标题，用于检测章节变化

    toolbar_left: -999,
    toolbar_top: 0,

    is_debug_signal: false,
    is_debug_click: false,
    unread_count: 0,
    is_handlering_selected_content: false,
    check_if_selected_content: false,
    showTimeoutDialog: false,
    show_theme_dialog: false,
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
  position: absolute;
  left: 0;
  top: 0;
  z-index: 999;
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
