<template>
  <v-card class="book-review-card">
    <!-- 标题栏 -->
    <v-row no-gutters class="br-fixed align-center">
      <v-col offset="2" cols="8" class="text-center">
        <h4 class="mt-3">本书评论</h4>
      </v-col>
      <v-col cols="2" class="text-right">
        <v-btn variant="plain" icon="mdi-close" @click="$emit('close')" title="关闭评论面板"></v-btn>
      </v-col>
    </v-row>

    <!-- 用户态：仅登录后显示昵称 + 设置入口（未登录时登录入口在面板底部） -->
    <template v-if="user">
      <v-list-item class="br-fixed" :title="user.nickName || user.nickname" :subtitle="user.email"
        @click="$emit('open-settings')">
        <template #prepend>
          <v-avatar v-if="user.avatar" :image="user.avatar"></v-avatar>
          <v-avatar v-else :color="avatar_color(user.id)">
            <span class="text-white">{{ avatar_text(user.nickName || user.nickname) }}</span>
          </v-avatar>
        </template>
        <template #append>
          <v-icon title="用户设置">mdi-cog-outline</v-icon>
        </template>
      </v-list-item>
      <v-divider class="br-fixed"></v-divider>
    </template>

    <!-- 最新 / 热门：排序由后端完成，切换时通知父组件重新拉取 -->
    <v-tabs class="br-fixed" :model-value="sort" @update:model-value="$emit('update:sort', $event)" density="compact" grow>
      <v-tab value="latest">最新</v-tab>
      <v-tab value="hot">热门</v-tab>
    </v-tabs>
    <v-divider class="br-fixed"></v-divider>

    <!-- 评论列表：面板内唯一滚动区 -->
    <div class="br-list">
      <v-list v-if="comments.length === 0" density="compact">
        <v-list-item class="my-4">
          <v-list-item-title class="text-center text-medium-emphasis">尚未有人发表评论</v-list-item-title>
        </v-list-item>
      </v-list>
      <v-list v-else id="book-review-list" density="compact">
        <template v-for="c in comments" :key="c.reviewId">
          <v-list-item class="pr-0 align-self-start mb-4" :subtitle="c.nickName">
            {{ c.content }}
            <div v-if="c.referText" class="br-refer text-caption text-medium-emphasis"
              :class="{ 'br-refer--link': c.cfi }" @click.stop="c.cfi && $emit('jump', c.cfi)">{{ c.referText }}</div>
            <v-list-item-subtitle>{{ c.level }}楼 · {{ c.createTime }} · {{ c.geo }}</v-list-item-subtitle>
            <template #prepend>
              <v-avatar v-if="c.avatar" :image="c.avatar" size="30"></v-avatar>
              <v-avatar v-else size="30" :color="avatar_color(c.userId)">
                <span class="text-white text-caption">{{ avatar_text(c.nickName) }}</span>
              </v-avatar>
            </template>
            <template #append>
              <v-btn class="px-0" size="small" variant="plain" stacked prepend-icon="mdi-thumb-up" title="点赞">{{ c.likeCount }}</v-btn>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </div>

    <!-- 底部：未登录显示登录按钮，登录后显示发表输入框 -->
    <v-card-text class="br-fixed my-2 py-0 px-2">
      <v-btn v-if="!login" @click="$emit('login')" variant="text" style="width: 100%">点击登录，发表评论</v-btn>
      <v-row v-else no-gutters class="align-center">
        <v-col cols="9">
          <v-text-field v-model="content" density="compact" single-line hide-details placeholder="爱书之人，维持良好的社区氛围"></v-text-field>
        </v-col>
        <v-col cols="3" class="text-right">
          <v-btn @click="submit">发表</v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  name: 'BookReview',
  props: ['login', 'user', 'comments', 'sort'],
  data: () => ({
    content: '',
  }),
  methods: {
    submit: function () {
      const text = this.content.trim();
      if (!text) return;
      this.$emit('add', text);
      this.content = '';
    },
    // 无头像时按 user_id 稳定哈希，从调色板里取一个默认彩色头像
    avatar_color: function (id) {
      const palette = ['#F2709C', '#FF9472', '#7B8FF7', '#42C2A8', '#FBC531', '#9B7EDE', '#4A9DEC', '#EE6C6C'];
      const s = String(id || 0);
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
      }
      return palette[h % palette.length];
    },
    avatar_text: function (name) {
      const n = (name || '').trim();
      return n ? n[0] : '书';
    },
  },
}
</script>

<style scoped>
/* 卡片做成 flex 列：标题/用户行/Tab/输入固定，唯有评论列表滚动 */
.book-review-card {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 卡片本身不滚动，避免与列表双重滚动条 */
}

.br-fixed {
  flex: 0 0 auto;
}

.br-list {
  flex: 1 1 auto;
  min-height: 0; /* 允许在 flex 中收缩，从而触发内部滚动 */
  overflow-y: auto;
}

/* 列表内的 v-list 交给 .br-list 滚动，自身不再产生滚动条 */
.br-list :deep(.v-list) {
  overflow: visible;
}

/* 评论引用的书籍正文：一行小字，左边框引用样式，过长省略 */
.br-refer {
  margin: 4px 0;
  padding: 2px 8px;
  border-left: 3px solid rgba(128, 128, 128, 0.4);
  background: rgba(128, 128, 128, 0.1);
  border-radius: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.7;
}

/* 有 cfi 时可点击跳转到正文位置 */
.br-refer--link {
  cursor: pointer;
}
.br-refer--link:hover {
  background: rgba(128, 128, 128, 0.18);
}
</style>

<style>
#book-review-list .v-list-item__append,
#book-review-list .v-list-item__prepend {
  align-self: flex-start;
}
</style>
