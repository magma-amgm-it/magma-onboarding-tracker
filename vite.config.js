import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base must match the GitHub repo name for GitHub Pages.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/magma-onboarding-tracker/',
})
