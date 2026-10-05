import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const targetUrl = (env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: targetUrl,
          changeOrigin: true,
        },
        '/static': {
          target: targetUrl,
          changeOrigin: true,
        }
      }
    }
  }
})
