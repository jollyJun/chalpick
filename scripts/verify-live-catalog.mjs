import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadLiveCatalog } from '../public/catalog-client.js';

const base = new URL(process.argv[2] || 'http://localhost:4173');
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password);
const requests = [];
const started = Date.now();
const catalog = await loadLiveCatalog({ fetchImpl: async (relative, options) => {
  const response = await fetch(new URL(relative, base), options);
  const bytes = Buffer.byteLength(await response.clone().text());
  requests.push({ path: relative, status: response.status, bytes });
  assert.ok(bytes < 4_000_000, 'Each response fits the Vercel function limit');
  return response;
} });
assert.equal(new Set(catalog.items.map(item => item.id)).size, catalog.items.length);
assert.equal(catalog.items.length + catalog.meta.excluded, catalog.meta.total);
assert.ok(catalog.items.every(item => item.type !== '애니메이션'));
assert.ok(catalog.items.every(item => !item.image.startsWith('data:')));
assert.ok(catalog.items.filter(item => item.adult).every(item => item.image === '/assets/adult-placeholder.svg'));
const report = {
  checkedAt: new Date().toISOString(), baseUrl: base.origin, durationMs: Date.now() - started,
  meta: catalog.meta, pageCount: requests.length, maxPageBytes: Math.max(...requests.map(request => request.bytes)),
  fantasy: catalog.items.filter(item => item.adult !== true && item.tagSlugs.includes('fantasy')).length,
  fantasyAll: catalog.items.filter(item => item.tagSlugs.includes('fantasy')).length,
  byMedia: Object.fromEntries(['웹툰', '웹소설', 'OTT', '영화'].map(media => [media, catalog.items.filter(item => item.type === media).length])),
  momentWorks: catalog.items.filter(item => item.contextTags.length).length,
  momentAssignments: catalog.items.reduce((total, item) => total + item.contextTags.length, 0),
  uniqueIds: true, adultImagesProtected: true, animationWorks: 0, requests
};
await mkdir(new URL('../verification/', import.meta.url), { recursive: true });
await writeFile(new URL('../verification/live-catalog.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, requests: undefined }, null, 2));
