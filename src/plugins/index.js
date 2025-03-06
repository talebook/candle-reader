/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import vuetify from './vuetify'
import serverPlugin from './server'

export function registerPlugins (app, options) {
  app
  .use(vuetify)
  .use(serverPlugin, options)
}
