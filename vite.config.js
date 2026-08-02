import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync, mkdirSync } from 'node:fs';

// Dev-only helper: POST a canvas dataURL to /dev-screenshot to save it under
// docs/media/ (or ?name=<file>.png to save an asset under public/). Used to
// capture README screenshots and generate PWA icons from the running game.
function screenshotSaver() {
  return {
    name: 'dev-screenshot-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-screenshot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const m = body.match(/^data:image\/(png|jpeg);base64,(.+)$/s);
            if (!m) { res.statusCode = 400; return res.end('bad dataURL'); }
            const name = new URL(req.originalUrl ?? req.url, 'http://x').searchParams.get('name');
            let file;
            if (name && /^[a-z0-9-]+\.(png|jpg)$/.test(name)) {
              mkdirSync('public', { recursive: true });
              file = `public/${name}`;
            } else {
              mkdirSync('docs/media', { recursive: true });
              file = `docs/media/screenshot.${m[1] === 'png' ? 'png' : 'jpg'}`;
            }
            writeFileSync(file, Buffer.from(m[2], 'base64'));
            res.end('saved ' + file);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [
    screenshotSaver(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Pole Position',
        short_name: 'PolePosition',
        description: 'First-person arcade racer — 11 tracks, 6 cars, Grand Prix mode',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#0a0e1e',
        theme_color: '#0a0e1e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,wav}'],
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
});
