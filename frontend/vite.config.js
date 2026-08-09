import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('leaflet') || id.includes('react-leaflet')) return 'maps';
          if (id.includes('motion')) return 'motion';
          if (id.includes('@phosphor-icons')) return 'icons';
          if (id.includes('@atlaskit')) return 'drag-and-drop';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          return 'vendor';
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
