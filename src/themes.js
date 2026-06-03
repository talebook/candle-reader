// 阅读主题数据。Settings 用它渲染卡片，EpubReader 用它应用主题。
//
// 字段说明：
//   id      唯一标识，持久化到 settings.theme
//   name    展示名
//   type    'solid' 纯色 | 'image' 背景图皮肤
//   mode    'day' | 'night'，用于白天/夜晚切换与 Vuetify app 主题
//   text    正文文字色
//   bg      背景底色（solid=正文底色；image=大图加载前/留边的底色，也决定整体明暗）
//   icon    设置面板里快捷图标按钮用的 mdi 图标（type=solid）
//   thumb     选择卡片用的小缩略图（type=image）
//   portrait  手机竖版阅读大图（type=image）
//   landscape PC 横版阅读大图（type=image）
//   mask    阅读时盖在大图上的半透明蒙版色，柔化背景、提升正文可读性（type=image）
//   sample  卡片预览里的示例文字

export const THEMES = [
  // —— 纯色主题（沿用既有配色，作为设置面板的 4 个快捷图标）——
  { id: 'white',   name: '白色',   type: 'solid', mode: 'day',
    bg: '#F6F6F6', text: '#142614', icon: 'mdi-weather-sunny', sample: '白底黑字，清爽分明' },
  { id: 'eyecare', name: '护眼',   type: 'solid', mode: 'day',
    bg: '#D3E3D3', text: '#142614', icon: 'mdi-eye', sample: '绿意护眼，久读不累' },
  { id: 'grey',    name: '夜灰',   type: 'solid', mode: 'night',
    bg: '#1A1A1A', text: '#C3C3C3', icon: 'mdi-weather-night', sample: '暗夜阅读，柔和不刺眼' },
  { id: 'dark',    name: '纯黑',   type: 'solid', mode: 'night',
    bg: '#000000', text: '#4B4B4B', icon: 'mdi-candle', sample: '极致省电，深邃沉静' },

  // —— 背景图皮肤（每套三图：缩略图 / 竖版 / 横版）——
  { id: 'zhulin',    name: '竹林清风', type: 'image', mode: 'day',
    bg: '#eef5e4', text: '#33472f', mask: 'rgba(255,255,255,0.20)',
    thumb: '/themes/skins/zhulin-thumb.svg',
    portrait: '/themes/skins/zhulin-portrait.svg',
    landscape: '/themes/skins/zhulin-landscape.svg',
    sample: '看花饮美酒，听鸟临晴山' },
  { id: 'parchment', name: '故纸堆',   type: 'image', mode: 'day',
    bg: '#f7efd9', text: '#5a3b1a', mask: 'rgba(252,246,232,0.20)',
    thumb: '/themes/skins/parchment-thumb.svg',
    portrait: '/themes/skins/parchment-portrait.svg',
    landscape: '/themes/skins/parchment-landscape.svg',
    sample: '旧纸新墨，字里春秋' },
  { id: 'huitu',     name: '灰土',     type: 'image', mode: 'night',
    bg: '#211e1a', text: '#cfcabf', mask: 'rgba(20,18,15,0.30)',
    thumb: '/themes/skins/huitu-thumb.svg',
    portrait: '/themes/skins/huitu-portrait.svg',
    landscape: '/themes/skins/huitu-landscape.svg',
    sample: '荒土残阳，独行天地间' },
  { id: 'xingye',    name: '星夜',     type: 'image', mode: 'night',
    bg: '#101730', text: '#cdd6e6', mask: 'rgba(12,16,32,0.28)',
    thumb: '/themes/skins/xingye-thumb.svg',
    portrait: '/themes/skins/xingye-portrait.svg',
    landscape: '/themes/skins/xingye-landscape.svg',
    sample: '万族之上，星河为劫' },
]

// 按 id 取主题，找不到时回退到白色。
export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0]
}
