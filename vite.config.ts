import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// /api and /i (the gateway to the pods) go to the platform inside the cluster: npm run cluster:forward → localhost:8080.
// This keeps the shell and the instance windows on the same origin.
const platform = 'http://localhost:8080';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': platform, '/i': platform } },
});
