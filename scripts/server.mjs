import http from 'node:http';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleNodeAuth } from '../server/auth.mjs';
import { handleNodeWeather } from '../server/weather.mjs';
import { handleNodeCatalog } from '../server/catalog.mjs';
import { createStaticHandler } from '../server/static.mjs';
import { SECURITY_HEADERS } from '../server/security.mjs';
try {
  // Existing process environment takes precedence. Never serve or print this file.
  process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('로컬 환경설정 파일을 읽지 못했습니다.');
}
const root = fileURLToPath(new URL('../dist/', import.meta.url));
await stat(path.join(root,'index.html'));
const serveStatic = createStaticHandler(root);
const port = Number(process.env.PORT || 4173);
http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/auth') { await handleNodeAuth(req, res); return; }
    if (pathname === '/api/weather') { await handleNodeWeather(req, res); return; }
    if (pathname === '/api/catalog') { await handleNodeCatalog(req, res); return; }
    await serveStatic(req, res);
  } catch { res.writeHead(404, { ...SECURITY_HEADERS, 'Cache-Control':'no-store', 'Content-Type':'text/plain; charset=utf-8' }); res.end('페이지를 찾을 수 없습니다.'); }
}).listen(port, '127.0.0.1', () => console.log(`Chalpick: http://localhost:${port}`));
