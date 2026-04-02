import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: 'public',
  publicDir: false,
  server: {
    port: 5173,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: '../node_modules/web-ifc/web-ifc.wasm',
          dest: '',
        },
        {
          src: '../node_modules/web-ifc/web-ifc-mt.wasm',
          dest: '',
        },
      ],
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['web-ifc'],
  },
});
