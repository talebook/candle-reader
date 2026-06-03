<template>
    <!-- 设置: 分别列出亮度、字体、背景、翻页、其他 五行设置项  -->
    <v-list density="compact">
        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>亮度</span>
                </v-col>
                <v-col cols="9">
                    <v-slider hide-details v-model="opt.brightness" max="100" min="1" step=1
                        @update:modelValue="$emit('update', opt)"></v-slider>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row class="align-center gx-3">
                <v-col cols="2">
                    <span class="text-justify">字体</span>
                </v-col>
                <v-col cols="2">
                    <v-btn class="text-justify" variant="outlined" density="comfortable" @click='set_and_emit("font_size", opt.font_size - 2)'>A-</v-btn>
                </v-col>
                <v-col cols="2" class="d-flex align-center justify-center">
                    <span class="d-inline-blockx text-center">{{ opt.font_size }}</span>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("font_size", opt.font_size + 2)'>A+</v-btn>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("font_size", 18)'>默认</v-btn>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>行距</span>
                </v-col>
                <v-col cols="2">
                    <v-btn class="text-justify" variant="outlined" density="comfortable" @click='set_and_emit("line_height", opt.line_height - 0.1)'>-</v-btn>
                </v-col>
                <v-col cols="2" class="d-flex align-center justify-center">
                    <span class="d-inline-blockx text-center">{{ opt.line_height.toFixed(1) }}</span>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("line_height", opt.line_height + 0.1)'>+</v-btn>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("line_height", 1.5)'>默认</v-btn>
                </v-col>
            </v-row>
        </v-list-item>

        <v-list-item class="my-2">
            <v-row class="align-center">
                <v-col cols="2">
                    <span>间距</span>
                </v-col>
                <v-col cols="2">
                    <v-btn class="text-justify" variant="outlined" density="comfortable" @click='set_and_emit("letter_spacing", opt.letter_spacing - 1)'>-</v-btn>
                </v-col>
                <v-col cols="2" class="d-flex align-center justify-center">
                    <span class="d-inline-blockx text-center">{{ opt.letter_spacing }}px</span>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("letter_spacing", opt.letter_spacing + 1)'>+</v-btn>
                </v-col>
                <v-col cols="3">
                    <v-btn variant="outlined" density="comfortable" @click='set_and_emit("letter_spacing", 0)'>默认</v-btn>
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
                    <span>控制</span>
                </v-col>
                <v-col cols="10">
                    <v-btn-group variant="outlined" divided density="compact">
                        <v-btn :active="opt.paging_control == 'mouse_and_keyboard'" @click='set_and_emit("paging_control", "mouse_and_keyboard")'>鼠标+键盘</v-btn>
                        <v-btn :active="opt.paging_control == 'keyboard_only'" @click='set_and_emit("paging_control", "keyboard_only")'>仅键盘</v-btn>
                    </v-btn-group>
                </v-col>
            </v-row>
        </v-list-item>


        <v-list-item class="my-2">
            <v-row class="align-center">
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
            <v-row class="align-center" no-gutters>
                <v-col cols="2">
                    <span density="compact">皮肤</span>
                </v-col>
                <v-col v-for="item in quick_themes" :key="item.id" class="text-center">
                    <v-btn :active="opt.theme == item.id" density="compact" :icon="item.icon" :color="item.bg"
                        @click='set_theme_and_emit(item.id, item.mode)'></v-btn>
                </v-col>
                <v-col cols="3" class="text-right">
                    <v-btn variant="text" density="compact" size="small" append-icon="mdi-chevron-right"
                        @click="$emit('open-themes')">更多</v-btn>
                </v-col>
            </v-row>
        </v-list-item>

</v-list>
</template>

<script>
import { THEMES } from '@/themes'

export default {
    name: 'Settings',
    emits: ['update', 'open-themes'],
    computed: {
        // 设置面板里的 4 个快捷图标（纯色主题）
        quick_themes: function () {
            return this.themes.filter(t => t.type === 'solid')
        },
    },
    mounted: function () {
        this.opt = {
            flow: this.settings?.flow || this.opt.flow,
            theme: this.settings?.theme || this.opt.theme,
            theme_mode: this.settings?.theme_mode || this.opt.theme_mode,
            font_size: this.settings?.font_size || this.opt.font_size,
            line_height: this.settings?.line_height || this.opt.line_height,
            letter_spacing: this.settings?.letter_spacing || this.opt.letter_spacing,
            brightness: this.settings?.brightness || this.opt.brightness,
            show_comments: this.settings?.show_comments ?? this.opt.show_comments,
            paging_control: this.settings?.paging_control || this.opt.paging_control,
        };
    },
    methods: {
        set_and_emit: function(key, val) {
            // 为字体大小添加限制：最小12px，最大48px
            if (key === 'font_size') {
                val = Math.max(12, Math.min(48, val));
            } else if (key === 'letter_spacing') {
                // 为字符间距添加限制：最小0px，最大20px
                val = Math.max(0, Math.min(20, val));
            } else if (key === 'line_height') {
                // 为行距添加限制：最小1.0，最大3.0
                val = Math.max(1.0, Math.min(3.0, val));
            }
            this.opt = {
                ...this.opt,
                [key]: val
            };
            this.$emit("update", { ...this.opt });
        },
        set_theme_and_emit: function(id, mode) {
            // 选中某套主题（id 唯一），并记录其对应的白天/夜晚模式
            this.opt = {
                ...this.opt,
                theme: id,
                theme_mode: mode
            };
            this.$emit("update", { ...this.opt });
        },
    },
    props: ['settings'],
    data: () => ({
        opt: {
            flow: "scrolled",
            theme: "eyecare",
            theme_mode: "day",
            font_size: 18,
            line_height: 1.5,
            letter_spacing: 0,
            brightness: 100,
            paging_control: "mouse_and_keyboard",
        },
        themes: THEMES,
    })
}

</script>
