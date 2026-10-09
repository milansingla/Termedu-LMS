import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@daily-co')) return 'daily';
          if (id.includes('exceljs')) return 'exceljs';
          if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('AdminUsers') || id.includes('BulkImportModal')) return 'admin';
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/interview': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
