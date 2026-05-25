import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/health': {
        target: 'http://localhost:8642',
        changeOrigin: true,
        headers: { origin: '' },
      },
      '/v1': {
        target: 'http://localhost:8642',
        changeOrigin: true,
        headers: { origin: '' },
      },
      '/api': {
        target: 'http://localhost:8642',
        changeOrigin: true,
        headers: { origin: '' },
      },
      '/config-api': {
        target: 'http://localhost:8643',
        changeOrigin: true,
      },
    },
  },
})
