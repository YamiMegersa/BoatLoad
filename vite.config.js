import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base so all built assets and scripts load relative to index.html.
  // This is required for hosting inside any university LAMP subdirectory (e.g. https://<server>/<group-dir>/).
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 1,
              maxSize: 400_000
            },
            {
              name: 'app',
              test: /src[\\/]/,
              maxSize: 400_000
            }
          ]
        }
      }
    }
  },
  server: {
    fs: {
      strict: false
    }
  },
  plugins: [
    {
      name: 'legacy-asset-rewriter',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.startsWith('/src/assets/')) {
            req.url = req.url.replace('/src/assets/', '/assets/');
          } else if (req.url.startsWith('/src/islands/')) {
            req.url = req.url.replace('/src/islands/', '/islands/');
          }
          next();
        });
      }
    }
  ]
});
