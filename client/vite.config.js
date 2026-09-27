import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Express backend. 127.0.0.1 rather than "localhost" on purpose: on
// Windows "localhost" can resolve to ::1 (IPv6) first, and if the API is
// only bound to IPv4 the proxy fails with a confusing ECONNREFUSED even
// though the server is running.
const API_TARGET = 'http://127.0.0.1:5000'

// Turns a dead backend into a readable message instead of a raw
// "AggregateError [ECONNREFUSED]" stack trace, and answers the browser with
// JSON so the login form can show a real error rather than hanging.
const friendlyProxyErrors = (proxy) => {
  let warned = false
  proxy.on('error', (err, _req, res) => {
    if (!warned) {
      warned = true
      console.log(
        `\n\x1b[31m[proxy] Cannot reach the NetGuard API at ${API_TARGET}\x1b[0m\n` +
          `\x1b[2m[proxy] Start it too — run "npm run dev" from the netguard/ folder to\n` +
          `[proxy] launch the server and the client together. If the server does start\n` +
          `[proxy] but exits, check its MongoDB connection error.\x1b[0m\n`
      )
    }
    // `res` is a plain socket for websocket upgrades, so guard before replying.
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          message:
            'Cannot reach the NetGuard API. Make sure the server is running on port 5000.',
          code: err.code,
        })
      )
    } else if (res && typeof res.destroy === 'function') {
      res.destroy()
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy /api and /socket.io requests to the Express backend in dev.
    // Why? The browser will be on localhost:5173 and the API on localhost:5000.
    // A proxy means the React app can call "/api/events" (same origin from
    // the browser's perspective), so we avoid CORS issues in dev and make
    // production deployment simpler (one origin).
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Adds X-Forwarded-For, so the API records the browser's real IP on
        // login events instead of the proxy's own 127.0.0.1.
        xfwd: true,
        configure: friendlyProxyErrors,
      },
      '/socket.io': {
        target: API_TARGET,
        ws: true,
        changeOrigin: true,
        configure: friendlyProxyErrors,
      },
    },
  },
})
