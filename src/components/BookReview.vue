<template>
  <v-card>
    <!-- 标题栏 -->
    <v-row no-gutters class="align-center">
      <v-col offset="2" cols="8" class="text-center">
        <h4 class="mt-3">本书评论</h4>
      </v-col>
      <v-col cols="2" class="text-right">
        <v-btn variant="plain" icon="mdi-close" @click="$emit('close')" title="关闭评论面板"></v-btn>
      </v-col>
    </v-row>

    <!-- 用户态：未登录提示登录，已登录显示昵称 + 设置入口 -->
    <v-list density="compact" class="py-0">
      <v-list-item v-if="!user" @click="$emit('login')" title="点击登录 · 参与评论"
        prepend-icon="mdi-account-circle-outline" append-icon="mdi-chevron-right"></v-list-item>
      <v-list-item v-else :title="user.nickName || user.nickname" :subtitle="user.email"
        @click="$emit('open-settings')">
        <template #prepend>
          <v-avatar :image="user.avatar" color="grey"></v-avatar>
        </template>
        <template #append>
          <v-icon title="用户设置">mdi-cog-outline</v-icon>
        </template>
      </v-list-item>
    </v-list>
    <v-divider></v-divider>

    <!-- 最新 / 热门：排序由后端完成，切换时通知父组件重新拉取 -->
    <v-tabs :model-value="sort" @update:model-value="$emit('update:sort', $event)" density="compact" grow>
      <v-tab value="latest">最新</v-tab>
      <v-tab value="hot">热门</v-tab>
    </v-tabs>
    <v-divider></v-divider>

    <!-- 评论列表 -->
    <v-list v-if="comments.length === 0" density="compact">
      <v-list-item class="my-4">
        <v-list-item-title class="text-center text-medium-emphasis">尚未有人发表评论</v-list-item-title>
      </v-list-item>
    </v-list>
    <v-list v-else id="book-review-list" density="compact">
      <template v-for="c in comments" :key="c.reviewId">
        <v-list-item class="pr-0 align-self-start mb-4" :subtitle="c.nickName">
          {{ c.content }}
          <v-list-item-subtitle>{{ c.level }}楼 · {{ c.createTime }} · {{ c.geo }}</v-list-item-subtitle>
          <template #prepend>
            <v-avatar variant="outlined" size="large" color="grey" class="text-center" :icon="c.avatar"></v-avatar>
          </template>
          <template #append>
            <v-btn class="px-0" size="small" variant="plain" stacked prepend-icon="mdi-thumb-up" title="点赞">{{ c.likeCount }}</v-btn>
          </template>
        </v-list-item>
      </template>
    </v-list>

    <!-- 底部输入 -->
    <v-card-text class="my-2 py-0 px-2">
      <v-btn @click="$emit('login')" variant="text" style="width: 100%" v-if="!login">点击登录，发表评论</v-btn>
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
  },
}
</script>

<style>
#book-review-list .v-list-item__append,
#book-review-list .v-list-item__prepend {
  align-self: flex-start;
}
</style>
