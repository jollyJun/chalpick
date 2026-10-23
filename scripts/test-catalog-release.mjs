import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectCatalog, validateCatalog, projectPublicCatalog, writeCatalogRelease, readCatalogRelease, refreshCatalogRelease } from './catalog-release.mjs';

const generatedAt = '2026-10-23T06:00:00.000Z';
const taxonomy = { groups: ['genre', 'setting', 'relationship'].map(id => ({ id, tags: id === 'genre' ? [{ label: '판타지', count: 0, countAll: 0 }] : [] })) };
const work = (id, extra = {}) => ({ id, title: `작품 ${id}`, type: '웹툰', adult: false, tagGroups: { genre: ['판타지'] }, ...extra });
const page = (items, extra = {}) => ({ items, taxonomy, meta: { source: 'supabase', total: items.length, offset: 0, limit: 500, scanned: items.length, excluded: 0, nextOffset: null, fetchedAt: generatedAt, ...extra } });

async function removeTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith('chalpick-release-'));
  await rm(resolved, { recursive: true, force: true });
}

test('build snapshot validates all 10,170 records before publishing one complete release', async () => {
  const source = Array.from({ length: 10170 }, (_, index) => work(index + 1));
  const requests = [];
  const catalog = await collectCatalog(async offset => {
    requests.push(offset);
    const items = source.slice(offset, offset + 500), next = offset + items.length;
    return page(items, { offset, total: source.length, nextOffset: next < source.length ? next : null });
  }, { generatedAt });
  assert.equal(requests.length, 21);
  assert.equal(catalog.items.length, 10170);
  assert.equal(catalog.meta.available, 10170);
  assert.equal(catalog.meta.generatedAt, generatedAt);
  assert.equal(catalog.taxonomy.groups[0].tags[0].count, 10170);
});

test('adult covers are blocked and adult/animation exclusions remain distinct', async () => {
  const catalog = await collectCatalog(async () => page([
    work(1), work(2, { age: 19, image: 'https://example.com/adult.jpg' }), work(3, { type: '애니메이션' })
  ]), { generatedAt });
  assert.equal(catalog.items.length, 2);
  assert.equal(catalog.items[1].image, '/assets/adult-placeholder.svg');
  assert.equal(catalog.meta.adultExcluded, 1);
  assert.equal(catalog.meta.excluded, 1);
  assert.equal(catalog.meta.available, 1);
  assert.deepEqual(catalog.taxonomy.groups[0].tags[0], { label: '판타지', count: 1, countAll: 2 });
});

test('missing records, changing counts, duplicate IDs, and broken cursors reject the whole release', async () => {
  const brokenPages = [
    [page([work(1)], { total: 2 })],
    [page([work(1)], { total: 2, nextOffset: 1 }), page([work(1)], { total: 2, offset: 1 })],
    [page([work(1)], { total: 2, nextOffset: 1 }), page([work(2)], { total: 3, offset: 1 })],
    [page([work(1)], { total: 2, nextOffset: 0 })],
    [page([work(1)], { total: 3, nextOffset: 2 })],
    [page([work(1)], { total: 2, scanned: 2 })],
    [page([work(1)], { source: 'legacy-static' })]
  ];
  for (const pages of brokenPages) {
    let index = 0;
    await assert.rejects(collectCatalog(async () => pages[index++], { generatedAt }));
  }
});

test('release validation rejects inflated taxonomy and unmasked adult images', async () => {
  const catalog = await collectCatalog(async () => page([work(1), work(2, { adult: true })]), { generatedAt });
  const wrongCount = structuredClone(catalog);
  wrongCount.taxonomy.groups[0].tags[0].count = 2;
  assert.throws(() => validateCatalog(wrongCount));
  const adultImage = structuredClone(catalog);
  adultImage.items[1].image = 'https://example.com/adult.jpg';
  assert.throws(() => validateCatalog(adultImage));
});

test('public snapshot omits unused analysis payload without changing source DB data or UI fields', async () => {
  const source = await collectCatalog(async () => page([work(1, {
    description: '검증된 소개', year: 2026, creators: ['작가'], contextTags: ['spring'],
    platforms: [{ name: '네이버웹툰', url: 'https://comic.naver.com/webtoon/list?titleId=1' }],
    image: 'https://example.com/cover.jpg', age: 15, ipId: 'ip-one',
    credits: [{ id: 20, name: '작가', role: 'STORY_WRITER', roleLabel: '글', identityKey: 'creator-20', identityConfidence: 'verified_external_id', candidateKey: 'STORY_WRITER:작가', sourceUrl: 'https://example.com/evidence' }],
    recommendation: { axes: { tempo: 4, mood: 2, resolve: 4, unusual: 3 } }, tagSlugs: ['fantasy']
  })]), { generatedAt });
  const original = structuredClone(source), projected = projectPublicCatalog(source), item = projected.items[0];
  assert.deepEqual(source, original);
  assert.equal(Object.hasOwn(item, 'recommendation'), false);
  assert.equal(Object.hasOwn(item, 'tagSlugs'), false);
  assert.deepEqual(item.credits[0], { name: '작가', role: 'STORY_WRITER', roleLabel: '글', identityKey: 'creator-20', identityConfidence: 'verified_external_id' });
  for (const key of ['id', 'title', 'type', 'description', 'year', 'creators', 'platforms', 'image', 'adult', 'age', 'ipId', 'tags', 'tagGroups', 'contextTags']) assert.deepEqual(item[key], source.items[0][key]);
  assert.deepEqual(projected.meta, source.meta);
  assert.deepEqual(projected.taxonomy, source.taxonomy);
  assert.deepEqual(projectPublicCatalog(projected), projected);
});

test('verified release round-trips with a SHA-256 content-addressed filename', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chalpick-release-'));
  try {
    const catalog = await collectCatalog(async () => page([work(1)]), { generatedAt });
    const written = await writeCatalogRelease(directory, catalog);
    const loaded = await readCatalogRelease(directory);
    assert.deepEqual(loaded, written);
    assert.match(written.manifest.hash, /^[a-f0-9]{64}$/);
    assert.equal(written.manifest.catalogUrl, `/data/live-catalog.${written.manifest.hash.slice(0, 16)}.json`);
    assert.ok(written.manifest.brotliBytes < written.manifest.bytes);
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test('missing, tampered, and metadata-mismatched cached releases fail closed', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chalpick-release-'));
  try {
    await assert.rejects(readCatalogRelease(directory));
    const catalog = await collectCatalog(async () => page([work(1)]), { generatedAt });
    const { manifest } = await writeCatalogRelease(directory, catalog);
    const file = path.join(directory, 'data', path.basename(manifest.catalogUrl));
    const original = await readFile(file, 'utf8');
    await writeFile(file, original.replace('작품 1', '작품 2'));
    await assert.rejects(readCatalogRelease(directory));
    await writeFile(file, original);
    await writeFile(path.join(directory, 'data/catalog-release.json'), JSON.stringify({ ...manifest, total: 99999 }));
    await assert.rejects(readCatalogRelease(directory));
    await writeFile(path.join(directory, 'data/catalog-release.json'), JSON.stringify({ ...manifest, catalogUrl: '/../server/catalog-age-ratings.json' }));
    await assert.rejects(readCatalogRelease(directory));
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test('a failed refresh cannot replace the last verified release manifest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chalpick-release-'));
  try {
    const { manifest } = await refreshCatalogRelease({ publicPath: directory, readPage: async () => page([work(1)]), generatedAt });
    await assert.rejects(refreshCatalogRelease({ publicPath: directory, readPage: async () => { throw new Error('upstream unavailable'); }, generatedAt }));
    assert.deepEqual((await readCatalogRelease(directory)).manifest, manifest);
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test('Vercel build with missing DB configuration fails instead of publishing an old release', () => {
  const env = { ...process.env, VERCEL: '1' };
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env, encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Vercel 배포에는 SUPABASE_URL과 공개 키를 등록해야/);
  assert.equal(result.stdout.includes('Verified local release'), false);
});
