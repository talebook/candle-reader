/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

import { createApp } from 'vue'
import { registerPlugins } from '@/plugins'
import CandleReader from '@/CandleReader.vue'

export class Reader {
    constructor(elem, args) {
        // 阅读器不直接请求任何评论或账号服务；划线、评论与登录态都经由 annotation_callbacks 交给宿主。
        const app = createApp(CandleReader, args)
        registerPlugins(app)
        app.mount(elem)
    }
}
