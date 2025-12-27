<template>
        <v-list @click:select="click_toc">
            <v-list-group>
                <template v-slot:activator="{ props }">
                    <v-list-item v-bind="props" title="书籍信息" ></v-list-item>
                </template>
                <v-list-item v-for="item in meta_items" :key="item.title"
                    :title="item.title" :subtitle="item.subtitle" lines=3></v-list-item>
            </v-list-group>
            <v-divider ></v-divider>
            <template v-for="(item, idx) in toc_items">
                <v-list-item v-if="item.subitems.length == 0" prepend-icon="mdi-book-open-page-variant-outline"
                    :title="item.label" :value="item.href"></v-list-item>

                <v-list-group v-else :key="item.href">
                    <template v-slot:activator="{ props }">
                        <v-list-item v-bind="props" prepend-icon="mdi-book-open-page-variant-outline"
                            :title="item.label" :value="item.href"></v-list-item>
                    </template>

                    <v-list-item v-for="(subitem, subidx) in item.subitems" :key="item.href" :title="subitem.label"
                        :value="subitem.href"></v-list-item>
                </v-list-group>

            </template>
        </v-list>
</template>

<script>
export default {
    name: 'BookToc',
    computed: {
        meta_items: function() {
            var items = [];
            for (var key in this.meta) {
                var val = this.meta[key];
                if (val == '' || val == null ) {
                    continue
                }
                items.push({title: this.gettext(key), subtitle: val, lines: 3})
            }
            console.log(items);
            return items;
        }
    },
    watch: {
        // 当目录项或当前章节变化时，滚动到当前章节
        toc_items: {
            handler() {
                this.$nextTick(() => {
                    this.scrollToCurrentChapter();
                });
            },
            deep: true
        },
        currentChapter: {
            handler() {
                this.$nextTick(() => {
                    this.scrollToCurrentChapter();
                });
            }
        }
    },
    mounted: function () {
        // 初始加载时滚动到当前章节
        this.$nextTick(() => {
            this.scrollToCurrentChapter();
        });
    },
    methods: {
        click_toc: function (item) {
            this.$emit('click:select', item);
        },
        has_data: function(v) {
            console.log(v);
            return (v != "" && v != undefined && v != null );
        },
        gettext: function(key) {
            const translation = {
                "creator": "作者",
                "description": "描述",
                "direction": "方向",
                "flow": "布局",
                "identifier": "标识符",
                "language": "语言",
                "modified_date": "修订日期",
                "orientation": "显示方向",
                "pubdate": "出版日期",
                "publisher": "出版社",
                "rights": "版权",
                "title": "书名",
            }
            return translation[key]!== undefined? translation[key] : key;
        },
        isCurrentChapter: function(item) {
            // 检查是否是当前章节
            if (!this.currentChapter) return false;
            
            // 比较章节ID或标题
            if (item.id && this.currentChapter.id) {
                return item.id === this.currentChapter.id;
            }
            // 比较href和label
            return item.href === this.currentChapter.href && item.label === this.currentChapter.label;
        },
        scrollToCurrentChapter: function() {
            // 滚动到当前章节
            if (!this.currentChapter) return;
            
            // 查找当前章节的DOM元素
            const listItems = this.$refs.listItem || [];
            for (const item of listItems) {
                if (item && item.$el) {
                    // 检查元素是否是当前章节
                    const isCurrent = Array.from(item.$el.classList).includes('current-chapter');
                    if (isCurrent) {
                        // 滚动到该元素
                        item.$el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        break;
                    }
                }
            }
        }
    },
    props: ["meta", "toc_items", "currentChapter"],
    data: () => ({
    })
}
</script>

<style scoped>
.current-chapter {
  background-color: rgba(63, 81, 181, 0.1) !important; /* 浅蓝色背景 */
  border-left: 4px solid #3f51b5 !important; /* 左侧蓝色边框 */
  font-weight: bold !important;
}
</style>
