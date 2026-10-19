import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: '/movie-nite/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Only the stylesheets the style tests read (as ?raw): App.css imported by a component stays empty.
    css: { include: [/index\.css/, /App\.css\?raw/] },
  },
})
