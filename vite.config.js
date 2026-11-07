import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
  server: {
    proxy: {
      // During local dev, forward /api calls to your Express server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
