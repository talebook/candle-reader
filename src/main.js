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
        var dev_server = window.location.origin.replace("5001", "5002");
        const app = createApp(CandleReader, args)
        registerPlugins(app, {
            server: args.server || dev_server,
        })
        app.mount(elem)
    }
}