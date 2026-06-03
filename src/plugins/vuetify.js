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

// 为每个阅读皮肤生成一套同名 Vuetify 主题：dark 决定明暗基底；
//   background = 皮肤底色 bg —— v-application 根背景，隐藏顶栏时灵动岛安全区露出的就是它，
//                必须设成 bg，否则浅色皮肤会露出 Vuetify 默认白底（iOS 顶部采样到白）。
//   surface    = 比 bg 更浓的面板色 —— 卡片/底部弹窗/底部导航等组件底色。
// 其余颜色（含对比文字色 on-*）交给 Vuetify 按基底自动推导。
// <v-app :theme="settings.theme"> 按皮肤 id 切换。
const themes = Object.fromEntries(
  THEMES.map(t => [t.id, { dark: t.mode === 'night', colors: { background: t.bg, surface: t.surface } }])
)

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'white',
    themes,
  },
})
