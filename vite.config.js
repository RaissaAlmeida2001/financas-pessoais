import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 fica livre pro portfólio
    // no desenvolvimento, as chamadas /api vão pro servidor Express
    proxy: { '/api': 'http://localhost:3001' },
  },
})
