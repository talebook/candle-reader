/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import vuetify from './vuetify'
import serverPlugin from './server'
import router from '@/router'

export function registerPlugins (app) {
  app
  .use(vuetify)
  .use(serverPlugin)
  .use(router)
}
