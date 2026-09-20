import path from "path"
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getImapInbox, getImapMessageDetail } from './api/imap-service'

function imapRelayPlugin(): Plugin {
  return {
    name: 'imap-relay',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Set CORS headers for all API requests
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.url === '/api/token' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
            try {
              const tokenResponse = await fetch('https://login.live.com/oauth20_token.srf', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body,
              })

              const data = await tokenResponse.json()
              res.statusCode = tokenResponse.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
            } catch (err: any) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message || 'Token proxy failed' }))
            }
          })
          return
        }

        if (req.url === '/api/imap/inbox' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
            try {
              const { email, accessToken } = JSON.parse(body)
              const messages = await getImapInbox(email, accessToken)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ messages }))
            } catch (err: any) {
              console.error("[IMAP Inbox Error]:", err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message || 'IMAP fetch failed' }))
            }
          })
          return
        }

        if (req.url === '/api/imap/detail' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
            try {
              const { email, accessToken, messageId } = JSON.parse(body)
              const message = await getImapMessageDetail(email, accessToken, messageId)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(message))
            } catch (err: any) {
              console.error("[IMAP Detail Error]:", err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message || 'IMAP detail fetch failed' }))
            }
          })
          return
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), imapRelayPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/token': {
        target: 'https://login.live.com/oauth20_token.srf',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/token/, '')
      }
    }
  },
  base: process.env.VITE_BASE_PATH || "/",
})
