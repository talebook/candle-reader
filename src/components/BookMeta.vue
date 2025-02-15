<template>
    <v-list>
        <v-list-group>
            <template v-slot:activator="{ props }">
                <v-list-item v-bind="props" title="书籍信息" ></v-list-item>
            </template>
            <v-list-item v-for="item in meta_items" :key="item.title"
                :title="item.title" :subtitle="item.subtitle" lines=3></v-list-item>
        </v-list-group>
        <v-divider ></v-divider>
        <v-list-item :title="comments_title" >
            <template v-slot:append>
                <v-btn
                        color="grey-lighten-1"
                        icon="mdi-arrow-right"
                        variant="text"
                        ></v-btn>
            </template>
        </v-list-item>
    </v-list>
</template>

<script>
export default {
    name: 'BookMeta',
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
    props: {
        meta: {
            type: Object,
            required: true
        }
    },
    data: () => ({
        comments_title: "笔记和评论(1335)",
    })
}

</script>
