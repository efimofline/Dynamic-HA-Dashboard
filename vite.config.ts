import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { layoutApi } from './vite-layout-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_HA_URL || 'http://homeassistant.local:8123';
  const port = Number(env.PORT) || 3000;
  return {
    // Relative base so assets + the /layout API resolve correctly whether the
    // app is served at the domain root or behind HA Ingress
    // (/api/hassio_ingress/<token>/…).
    base: './',
    plugins: [react(), layoutApi()],
    server: {
      port,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/local': {
          target,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port,
      host: true,
      // Ingress requests arrive with a dynamic Host header; allow any so the
      // add-on's preview server doesn't reject them.
      allowedHosts: true,
    },
  };
});
