<template>
        <v-list @click:select="click_toc" ref="tocList">
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
                    :title="item.label" :value="item.href"
                    :class="{ 'current-chapter': isCurrentChapter(item) }"
                    ref="listItem"></v-list-item>

                <v-list-group v-else :key="item.href">
                    <template v-slot:activator="{ props }">
                        <v-list-item v-bind="props" prepend-icon="mdi-book-open-page-variant-outline"
                            :title="item.label" :value="item.href"
                            :class="{ 'current-chapter': isCurrentChapter(item) }"
                            ref="listItem"></v-list-item>
                    </template>

                    <v-list-item v-for="(subitem, subidx) in item.subitems" :key="subitem.href" :title="subitem.label"
                        :value="subitem.href"
                        :class="{ 'current-chapter': isCurrentChapter(subitem) }"
                        ref="listItem"></v-list-item>
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
            
            // 更可靠的比较方式：只比较href，因为label可能会有细微差别
            // 规范化href，去除可能的锚点
            const normalizeHref = (href) => {
                if (!href) return '';
                return href.split('#')[0];
            };
            
            const currentHref = normalizeHref(this.currentChapter.href);
            const itemHref = normalizeHref(item.href);
            
            return currentHref === itemHref;
        },
        scrollToCurrentChapter: function() {
            // 滚动到当前章节
            if (!this.currentChapter) return;
            
            // 遍历目录树，查找匹配的章节
            const findMatchingChapter = (tocArray) => {
                for (const item of tocArray) {
                    if (this.isCurrentChapter(item)) {
                        return item;
                    }
                    if (item.subitems && item.subitems.length > 0) {
                        const found = findMatchingChapter(item.subitems);
                        if (found) return found;
                    }
                }
                return null;
            };
            
            const matchingChapter = findMatchingChapter(this.toc_items);
            if (matchingChapter) {
                // 使用setTimeout确保DOM已经更新
                setTimeout(() => {
                    // 使用ref获取目录列表容器
                    const listContainer = this.$refs.tocList;
                    if (listContainer) {
                        // 查找所有列表项
                        const listItems = listContainer.querySelectorAll('.v-list-item');
                        
                        // 遍历列表项，找到匹配的章节
                        for (const item of listItems) {
                            // 获取列表项的title属性
                            const title = item.getAttribute('title');
                            if (title && matchingChapter.label && title.includes(matchingChapter.label)) {
                                // 滚动到匹配的元素
                                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                break;
                            }
                        }
                    }
                }, 100);
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
