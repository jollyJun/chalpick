import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleNodeAuth } from '../server/auth.mjs';
import { handleNodeWeather } from '../server/weather.mjs';
import { handleNodeCatalog } from '../server/catalog.mjs';
try {
  // Existing process environment takes precedence. Never serve or print this file.
  process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('로컬 환경설정 파일을 읽지 못했습니다.');
}
const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/auth') { await handleNodeAuth(req, res); return; }
    if (pathname === '/api/weather') { await handleNodeWeather(req, res); return; }
    if (pathname === '/api/catalog') { await handleNodeCatalog(req, res); return; }
    const requested = decodeURIComponent(pathname);
    let file = path.resolve(root, '.' + requested);
    if (file !== path.resolve(root) && !file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const content = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(content);
  } catch { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('페이지를 찾을 수 없습니다.'); }
}).listen(port, '127.0.0.1', () => console.log(`Chalpick: http://localhost:${port}`));
