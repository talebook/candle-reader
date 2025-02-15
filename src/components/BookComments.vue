<template>
  <v-card>
    <v-row>
      <v-col offset="2" cols="8" class="text-center">
        <h4 class="mt-3">评论列表</h4>
      </v-col>
      <v-col cols="2">
        <v-btn variant="plain" icon="mdi-close" @click="$emit('close')"></v-btn>
      </v-col>
    </v-row>
    <v-divider></v-divider>
    <v-list  v-if="comments.length == 0"  density="compact">
      <v-list-item class="my-4">
        <v-list-item-title class="text-center">尚未有人发表评论</v-list-item-title>
      </v-list-item>
    </v-list>
    <v-list v-else id='book-comments' density="compact">
      <template v-for="c in comments">
        <v-list-item class="pr-0 align-self-start mb-4" :prepend-avatar="c.avatar" append-icon="mdi-thumb-up"
          :subtitle="c.nickName">
          {{ c.content }}
          <v-list-item-subtitle>{{ c.level }}楼 * {{ c.createTime }} * {{ c.geo }}</v-list-item-subtitle>
          <template v-slot:prepend>
            <v-avatar variant="outlined" class="text-center" :icon="c.avatar"></v-avatar>
          </template>
          <template v-slot:append>
            <v-btn class="px-0" size=small variant=plain stacked prepend-icon="mdi-thumb-up">{{ c.likeCount }}</v-btn>
          </template>
        </v-list-item>
      </template>
    </v-list>
    <v-card-text class="my-2 py-0 px-2">
      <v-btn @click="login = !login" variant=text style="width: 100%" v-if="!login">点击登录，发表评论</v-btn>
      <v-row v-else>
        <v-col cols=9>
          <v-text-field v-model="content" density="compact" single-line hide-details placeholder="爱书之人，维持良好的社区氛围"></v-text-field>
        </v-col>
        <v-col cols=3>
          <v-btn @click="$emit('add_review', this.content)">发表</v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  name: 'BookComments',
  computed: {
  },
  mounted: function () {
  },
  methods: {
  },
  props: ["login", "comments"],
  data: () => ({
    content: "",
  })
}

</script>

<style>
#book-comments .v-list-item__append,
#book-comments .v-list-item__prepend {
  align-self: flex-start
}
</style>
