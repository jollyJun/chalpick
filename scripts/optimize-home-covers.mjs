import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_PROFILE, immersivePicks, sortByTaste } from '../public/recommendation.js';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const projectPath = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const publicPath = path.join(projectPath, 'public');
const outputPath = path.join(publicPath, 'assets', 'covers');
const approvedHosts = new Set([
  'image-comic.pstatic.net',
  'comicthumb-phinf.pstatic.net',
  'dn-img-page.kakao.com',
]);
const maxBytes = 12 * 1024 * 1024;

function approvedURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !approvedHosts.has(url.hostname)
    || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Image URL is not an approved public CDN address');
  }
  return url;
}

function uniqueIPs(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.ipId || String(item.title || '').replace(/\(소설\)$/, '').normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ko');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function downloadImage(source) {
  let url = approvedURL(source);
  const signal = AbortSignal.timeout(15000);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg',
        'User-Agent': 'Mozilla/5.0',
        Referer: url.hostname.endsWith('.pstatic.net') ? 'https://comic.naver.com/' : 'https://page.kakao.com/',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('Image redirect limit exceeded');
      url = approvedURL(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Image server returned ${response.status}`);
    }
    if (!/^image\/(?:avif|webp|png|jpe?g|gif)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      throw new Error('Image response has an unsupported content type');
    }
    if (Number(response.headers.get('content-length') || 0) > maxBytes) {
      await response.body?.cancel();
      throw new Error('Image exceeds the download size limit');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error('Image exceeds the download size limit');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Image request did not complete');
}

const release = JSON.parse(await readFile(path.join(publicPath, 'data', 'catalog-release.json'), 'utf8'));
if (!/^\/data\/live-catalog\.[a-f0-9]{16,64}\.json$/.test(release.catalogUrl || '')) {
  throw new Error('A validated public catalog release is required');
}
const catalog = JSON.parse(await readFile(path.join(publicPath, release.catalogUrl.slice(1)), 'utf8'));
if (!Array.isArray(catalog.items) || catalog.items.length !== release.total) {
  throw new Error('Catalog release count is inconsistent');
}
const eligible = catalog.items.filter(item => item.adult !== true);
const sorted = sortByTaste(eligible, SAMPLE_PROFILE);
const candidates = [
  ...uniqueIPs(sortByTaste(eligible.filter(item => item.image), SAMPLE_PROFILE)).slice(0, 6),
  ...immersivePicks(eligible, SAMPLE_PROFILE, 6),
  ...sorted.slice(0, 12),
];
const selected = [...new Map(candidates.map(item => [item.id, item])).values()].slice(0, 12);
await mkdir(outputPath, { recursive: true });
const manifest = [];
const skipped = [];
let totalBytes = 0;
for (let offset = 0; offset < selected.length; offset += 3) {
  const results = await Promise.all(selected.slice(offset, offset + 3).map(async item => {
    try {
      const source = item.image;
      const original = await downloadImage(source);
      const optimized = await sharp(original, { limitInputPixels: 50000000 })
        .rotate()
        .resize({ width: 400, height: 600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 6 })
        .toBuffer();
      const hash = createHash('sha256').update(optimized).digest('hex').slice(0, 24);
      const filename = `${hash}.webp`;
      await writeFile(path.join(outputPath, filename), optimized);
      return { entry: { id: item.id, source, url: `/assets/covers/${filename}` }, bytes: optimized.length };
    } catch (error) {
      return { skipped: { id: item.id, title: item.title, reason: error.message } };
    }
  }));
  for (const result of results) {
    if (result.entry) {
      manifest.push(result.entry);
      totalBytes += result.bytes;
    } else {
      skipped.push(result.skipped);
    }
  }
}
await writeFile(path.join(outputPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ selected: selected.length, optimized: manifest.length, totalBytes, skipped }, null, 2));
