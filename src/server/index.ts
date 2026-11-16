// Single Node server: boardgame.io game server + lobby API + (in production) the built frontend from dist/.
import { Server, Origins } from 'boardgame.io/server';
import serve from 'koa-static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Betrayal } from '../engine/game';

const PORT = Number(process.env.PORT ?? 8000);
const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
const server = Server({ games: [Betrayal], origins: [Origins.LOCALHOST_IN_DEVELOPMENT, Origins.LOCALHOST, /.*/, ...extra] });

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
if (fs.existsSync(dist)) {
  server.app.use(serve(dist));
  // SPA fallback
  server.app.use(async (ctx, next) => {
    await next();
    if (ctx.status === 404 && ctx.method === 'GET' && !ctx.path.startsWith('/games') && !ctx.path.startsWith('/socket.io')) {
      ctx.type = 'html'; ctx.body = fs.createReadStream(path.join(dist, 'index.html')); ctx.status = 200;
    }
  });
}
server.run(PORT, () => console.log(`Betrayal server on http://0.0.0.0:${PORT}${fs.existsSync(dist) ? ' (serving dist/)' : ''}`));
