import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

// Dev-only helper: POST a canvas dataURL to /dev-screenshot to save it under
// docs/media/ (used to capture README screenshots from the running game).
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
            mkdirSync('docs/media', { recursive: true });
            const file = `docs/media/screenshot.${m[1] === 'png' ? 'png' : 'jpg'}`;
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
  plugins: [screenshotSaver()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
});
