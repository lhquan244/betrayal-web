import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: true },
  define: { 'process.env': {} },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
