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
    mounted: function () {
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

    },
    props: ["meta", "toc_items"],
    data: () => ({
    })
}

</script>
