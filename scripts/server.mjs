import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { handleNodeAuth } from '../server/auth.mjs';
import { handleNodeWeather } from '../server/weather.mjs';
import { handleNodeCatalog } from '../server/catalog.mjs';
try {
  // Existing process environment takes precedence. Never serve or print this file.
  process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('로컬 환경설정 파일을 읽지 못했습니다.');
}
const root = fileURLToPath(new URL('../dist/', import.meta.url));
await stat(path.join(root,'index.html'));
const compress=promisify(brotliCompress),encodedFiles=new Map();
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
    const extension=path.extname(file),info=await stat(file),immutable=/\/(?:data\/live-catalog\.[a-f0-9]+\.json|assets\/covers\/[a-f0-9]+\.webp)$/.test(requested);
    const headers={'Content-Type':mime[extension]||'application/octet-stream','Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Accept-Encoding'};
    let content;
    if(/\bbr\b/.test(req.headers['accept-encoding']||'')&&['.html','.css','.js','.json','.svg'].includes(extension)){
      const key=`${file}:${info.mtimeMs}`;
      if(!encodedFiles.has(key))encodedFiles.set(key,readFile(file).then(buffer=>compress(buffer,{params:{[constants.BROTLI_PARAM_QUALITY]:4}})));
      content=await encodedFiles.get(key);headers['Content-Encoding']='br';
    }else content=await readFile(file);
    res.writeHead(200, headers);
    res.end(content);
  } catch { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('페이지를 찾을 수 없습니다.'); }
}).listen(port, '127.0.0.1', () => console.log(`Chalpick: http://localhost:${port}`));
