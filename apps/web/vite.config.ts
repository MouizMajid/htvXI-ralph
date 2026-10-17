import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RALPH',
        short_name: 'RALPH',
        description: 'Ralph helps kids tell the care team how they feel.',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/kiosk',
        background_color: '#fdf8f0',
        theme_color: '#fdf8f0',
        icons: [], // TODO: add 192/512 icons once art lands
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
