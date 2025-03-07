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
        var default_server = 'https://api.talebook.org';
        const app = createApp(CandleReader, args)
        registerPlugins(app, {
            server: args.server || default_server,
        })
        app.mount(elem)
    }
}
