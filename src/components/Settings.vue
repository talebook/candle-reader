<template>
    <!-- 设置: 分别列出亮度、字体、背景、翻页、其他 五行设置项  -->
    <v-list density="compact">
        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>亮度*</span>
                </v-col>
                <v-col cols="9">
                    <v-slider hide-details v-model="opt.brightness" max="100" min="1" step=1
                        @update:modelValue="$emit('update', opt)"></v-slider>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span class="text-justify">字体*</span>
                </v-col>
                <v-col cols="3" height="48">
                    <v-btn class="text-justify" variant="outlined" density="comfortable" @click='set_and_emit("font_size", opt.font_size - 2)'>A-</v-btn>
                </v-col>
                <v-col cols="2">
                    <span class="d-inline-blockx text-center d-flex">{{ opt.font_size }}</span>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("font_size", opt.font_size + 2)'>A+</v-btn>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>翻页</span>
                </v-col>
                <v-col cols="10">
                    <v-btn-group variant="outlined" divided density="compact">
                        <v-btn :active="opt.flow == 'paginated'" @click='set_and_emit("flow", "paginated")'>左右点击</v-btn>
                        <v-btn :active="opt.flow == 'scrolled'" @click='set_and_emit("flow", "scrolled")'>上下滑动</v-btn>
                    </v-btn-group>
                </v-col>
            </v-row>
        </v-list-item>


        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>动画*</span>
                </v-col>
                <v-col cols="10">
                    <v-btn-group variant="outlined" divided density="compact">
                        <v-btn active>无动画</v-btn>
                        <v-btn @click="alert('开发中，敬请期待')">平移</v-btn>
                        <v-btn @click="alert('开发中，敬请期待')">仿真</v-btn>
                    </v-btn-group>
                </v-col>
            </v-row>
        </v-list-item>


        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>背景*</span>
                </v-col>
                <v-col cols="10">
                    <v-btn-group variant="outlined" divided density="compact">
                        <v-btn active>主题图0</v-btn>
                        <v-btn @click="alert('开发中，敬请期待')">主题图1</v-btn>
                        <v-btn @click="alert('开发中，敬请期待')">主题图2</v-btn>
                    </v-btn-group>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row style="margin-bottom: 1px">
                <v-col cols="2">
                    <span density="compact">章评*</span>
                </v-col>
                <v-col cols="10">
                    <v-btn-group variant="outlined" divided density="compact">
                        <v-btn :active="opt.show_comments == true" @click="set_and_emit('show_comments', true)">开启</v-btn>
                        <v-btn :active="opt.show_comments == false" @click="set_and_emit('show_comments', false)">关闭</v-btn>
                    </v-btn-group>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row style="margin-bottom: 1px">
                <v-col cols="2">
                    <span density="compact">主题</span>
                </v-col>
                <v-col cols="2" v-for="item in themes">
                    <v-btn :active="opt.theme == item.name" density="compact" :icon="item.icon" :color="item.color"
                        @click='set_theme_and_emit(item.name, item.mode)'></v-btn>
                </v-col>
            </v-row>
        </v-list-item>

        <v-divider></v-divider>
        <v-list-item class="my-2" title="带 * 号功能都在开发中"> 
        </v-list-item>


</v-list>
</template>

<script>
export default {
    name: 'Settings',
    computed: {
    },
    mounted: function () {
        this.opt = {
            flow: this.settings.flow,
            theme: this.settings.flow,
            theme_mode: this.settings.theme_mode,
            font_size: this.settings.font_size,
            brightness: this.settings.brightness,
            show_comments: this.settings.show_comments,
        }
    },
    methods: {
        set_and_emit: function(key, val) {
            this.opt[key] = val;
            this.$emit("update", this.opt);
        },
        set_theme_and_emit: function(name, mode) {
            this.opt.theme = name;
            this.opt.theme_mode = mode;
            this.$emit("update", this.opt);
        }
    },
    props: ['settings'],
    data: () => ({
        opt: {
            flow: "scrolled",
            theme: "eyecare",
            theme_mode: "day",
            font_size: 18,
            brightness: 100,
        },
        themes: [{
            name: "white",
            mode: "day",
            color: '#F6F6F6',
            icon: "mdi-weather-sunny",
        }, {
            name: "eyecare",
            mode: "day",
            color: '#D3E3D3',
            icon: "mdi-eye",
        }, {
            name: "grey",
            mode: "night",
            color: '#4B4B4B',
            icon: "mdi-weather-night",
        }, {
            name: "dark",
            mode: "night",
            color: '#1A1A1A',
            icon: "mdi-candle",
        } ],
    })
}

</script>
