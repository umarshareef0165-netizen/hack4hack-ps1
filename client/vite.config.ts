import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev only: the Vite server forwards /api to the API so the UI works
      // without CORS setup. Production serves the built UI separately.
      '/api': 'http://localhost:4000',
    },
  },
});
