import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` talks to the API on :3000 (run it with `cd server && npm run dev`, or via Docker).
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000' },
  },
})
