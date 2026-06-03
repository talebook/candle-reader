/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'

import { THEMES } from '@/themes'

// 为每个阅读皮肤生成一套同名 Vuetify 主题：dark 决定明暗基底，仅覆盖 surface（面板色），
// 其余颜色（含面板上的对比文字色 on-surface）交给 Vuetify 按基底自动推导。
// <v-app :theme="settings.theme"> 按皮肤 id 切换，使卡片/底部弹窗/顶栏等组件底色随皮肤变化。
const themes = Object.fromEntries(
  THEMES.map(t => [t.id, { dark: t.mode === 'night', colors: { surface: t.surface } }])
)

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'white',
    themes,
  },
})
