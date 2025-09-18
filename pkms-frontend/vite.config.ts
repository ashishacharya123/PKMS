import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin to handle SPA routing
// This ensures that when you refresh the page on /todos, /diary, etc.,
// the server serves index.html instead of a 404, allowing React Router
// to handle the routing on the client side.
function spaFallback() {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      // Handle SPA routing by serving index.html for all routes
      // Priority: Vite internal routes > API/Assets > Client routes
      server.middlewares.use((req, res, next) => {
        // Skip Vite's internal routes (essential for development)
        if (req.url?.startsWith('/@vite/') || 
            req.url?.startsWith('/@react-refresh') ||
            req.url?.startsWith('/@fs/') ||
            req.url?.startsWith('/@import/')) {
          return next()
        }
        
        // Skip API routes and static assets
        if (req.url?.startsWith('/api/') || 
            req.url?.includes('.') || 
            req.url?.startsWith('/_') ||
            req.url?.startsWith('/favicon.ico')) {
          return next()
        }
        
        // Skip any other Vite-specific routes
        if (req.url?.startsWith('/node_modules/') ||
            req.url?.startsWith('/src/')) {
          return next()
        }
        
        // For all other routes, serve index.html to enable client-side routing
        req.url = '/'
        next()
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '192.168.1.180',
      '192.168.56.1',
      '172.28.80.1'
    ],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
      },
    },
  },
  // Ensure SPA routing works in production build
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
}) 