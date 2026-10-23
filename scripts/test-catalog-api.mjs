import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCatalog, loadCatalogPage } from '../server/catalog.mjs';
import { GET } from '../api/catalog.js';

const ENV = { SUPABASE_URL: 'https://catalog.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public_test_key' };
const CLOCK = Date.UTC(2026, 9, 23, 4);
const work = (id, extra = {}) => ({ id, title: `작품 ${id}`, media: '웹툰', release_year: 2026, synopsis: '공식 소개', thumbnail_url: 'https://images.example.test/cover.jpg', tempo: 55, mood: 60, resolve: 70, unusual: 65, tag_slugs_cache: ['fantasy'], recommendation_status: 'LIMITED', ...extra });
const request = (query = '', extra = {}) => new Request(`https://chalpick.example.test/api/catalog${query}`, extra);
function setup({ contents = [work(1)], related = {}, caps = {}, transform, ...overrides } = {}) {
  const calls = [];
  const tables = { contents, tag_dictionary: [{ tag_slug: 'fantasy', display_name: '판타지', category: 'genre', status: 'active' }], content_creators: [], content_platforms: [], content_complexity: [], ...related };
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const table = url.pathname.split('/').at(-1);
    calls.push({ url, init, table });
    assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
    const source = tables[table];
    const offset = Number(url.searchParams.get('offset'));
    const limit = Math.min(Number(url.searchParams.get('limit')), caps[table] || Infinity);
    const rows = source.slice(offset, offset + limit);
    const range = rows.length ? `${offset}-${offset + rows.length - 1}/${source.length}` : `*/${source.length}`;
    const response = Response.json(rows, { headers: { 'Content-Range': range } });
    return transform ? transform({ url, init, table, offset, rows, response }) : response;
  };
  const options = { env: ENV, fetchImpl, cache: new Map(), now: () => CLOCK, ageRatings: {}, ...overrides };
  return { calls, options, call: input => handleCatalog(input || request(), options) };
}

test('serves a 500-row live page without imposing the old catalog limit', async () => {
  const contents = Array.from({ length: 10170 }, (_, index) => work(index + 1));
  const { call, calls } = setup({ contents });
  const response = await call();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 500);
  assert.deepEqual(payload.meta, { source: 'supabase', total: 10170, offset: 0, limit: 500, scanned: 500, excluded: 0, nextOffset: 500, fetchedAt: new Date(CLOCK).toISOString() });
  const contentsCall = calls.find(call => call.table === 'contents');
  assert.equal(contentsCall.url.searchParams.get('order'), 'id.asc');
  assert.equal(contentsCall.url.searchParams.get('recommendation_status'), 'neq.HOLD');
  assert.equal(contentsCall.url.searchParams.get('limit'), '500');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(payload.taxonomy.groups[0].tags[0].label, '판타지');
});

test('last-page totals remain exact and absent pages are never silently filled from a snapshot', async () => {
  const { options } = setup({ contents: Array.from({ length: 10170 }, (_, index) => work(index + 1)) });
  const payload = await loadCatalogPage(10000, options);
  assert.equal(payload.items[0].id, 10001);
  assert.equal(payload.items.at(-1).id, 10170);
  assert.equal(payload.meta.scanned, 170);
  assert.equal(payload.meta.total, 10170);
  assert.equal(payload.meta.nextOffset, null);
});

test('related tables follow actual server page caps rather than assuming a full 1000-row response', async () => {
  const creators = Array.from({ length: 3 }, (_, index) => ({ id: index + 1, content_id: 1, person_id: index + 10, creator_role: 'STORY_WRITER', credit_order: index, person: { id: index + 10, name: `작가 ${index + 1}` } }));
  const { call, calls } = setup({ related: { content_creators: creators }, caps: { content_creators: 1 } });
  const response = await call();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.items[0].creators, ['작가 1', '작가 2', '작가 3']);
  const creatorCalls = calls.filter(call => call.table === 'content_creators');
  assert.deepEqual(creatorCalls.map(call => call.url.searchParams.get('offset')), ['0', '1', '2']);
  assert.ok(creatorCalls.every(call => call.url.searchParams.get('content_id') === 'in.(1)'));
});

test('empty public catalogs are reported explicitly and unsupported media are accounted for', async () => {
  const empty = await (await setup({ contents: [] }).call()).json();
  assert.equal(empty.meta.total, 0);
  assert.equal(empty.meta.scanned, 0);
  assert.equal(empty.meta.nextOffset, null);
  assert.deepEqual(empty.items, []);
  const media = await (await setup({ contents: [work(1), work(2, { media: '애니메이션' })] }).call()).json();
  assert.equal(media.meta.total, 2);
  assert.equal(media.meta.excluded, 1);
  assert.deepEqual(media.items.map(item => item.id), [1]);
});

test('uses only explicit public projections and never forwards visitor credentials to Supabase', async () => {
  const { call, calls } = setup();
  await call(request('', { headers: { Cookie: 'session=private', Authorization: 'Bearer visitor-private', 'x-forwarded-for': '192.0.2.5' } }));
  for (const { url, init } of calls) {
    assert.equal(url.origin, ENV.SUPABASE_URL);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(init.headers.Prefer, 'count=exact');
    assert.ok(!url.searchParams.get('select').includes('*'));
    const serialized = JSON.stringify(init.headers);
    assert.equal(/visitor-private|session=private|192\.0\.2\.5/.test(serialized), false);
  }
  assert.equal(JSON.stringify(await (await call()).json()).includes(ENV.SUPABASE_PUBLISHABLE_KEY), false);
});

test('rejects writes, invalid offsets and caller-defined filters before querying the database', async () => {
  const { call, calls } = setup();
  const writeResponse = await call(request('', { method: 'POST' }));
  assert.equal(writeResponse.status, 405);
  assert.equal(writeResponse.headers.get('Allow'), 'GET');
  for (const query of ['?offset=-1', '?offset=1.5', '?offset=01', '?offset=Infinity', '?offset=9007199254740992', '?offset=0&offset=500', '?select=*', '?offset=0&table=users']) {
    assert.equal((await call(request(query))).status, 400, query);
  }
  assert.equal(calls.length, 0);
});

test('missing configuration and secret or service-role keys cannot be used for public catalog reads', async () => {
  const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  for (const env of [{}, { ...ENV, SUPABASE_URL: 'http://catalog.example.test' }, { ...ENV, SUPABASE_URL: 'https://username:password@catalog.example.test' }, { ...ENV, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private_key' }, { ...ENV, SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }]) {
    const { call, calls } = setup({ env });
    const response = await call();
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
    assert.equal(/password|sb_secret|private_key|signature/.test(body), false);
  }
  const { call } = setup({ env: { SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_ANON_KEY: jwt('anon') } });
  assert.equal((await call()).status, 200);
});

test('does not leak upstream errors or recover with the old static catalog', async () => {
  for (const fetchImpl of [async () => new Response('PRIVATE_DB_HOST sb_secret_private_debug', { status: 403 }), async () => { throw new Error('PRIVATE_DB_HOST sb_secret_private_debug'); }, async () => Response.json({ private: 'PRIVATE_DB_HOST' })]) {
    const { call } = setup({ fetchImpl });
    const response = await call();
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(/PRIVATE_DB_HOST|sb_secret|items|2500/.test(body), false);
    assert.equal(JSON.parse(body).error, 'catalog_unavailable');
  }
});

test('requires exact and consistent upstream counts with no partial related-table result', async () => {
  for (const transform of [
    ({ table, response }) => table === 'contents' ? Response.json([work(1)]) : response,
    ({ table, response }) => table === 'contents' ? Response.json([work(1)], { headers: { 'Content-Range': '9-9/10' } }) : response,
    ({ table, response }) => table === 'contents' ? Response.json([], { headers: { 'Content-Range': '*/10' } }) : response,
    ({ table, offset, response }) => table === 'content_creators' && offset > 0 ? Response.json([], { headers: { 'Content-Range': '*/3' } }) : response
  ]) {
    const related = { content_creators: [{ id: 1, content_id: 1 }, { id: 2, content_id: 1 }] };
    assert.equal((await setup({ related, caps: { content_creators: 1 }, transform }).call()).status, 503);
  }
});

test('dictionary cache expires while each request reads fresh contents', async () => {
  let now = CLOCK;
  const { call, calls } = setup({ now: () => now });
  await call();
  await call();
  assert.equal(calls.filter(call => call.table === 'tag_dictionary').length, 1);
  assert.equal(calls.filter(call => call.table === 'contents').length, 2);
  now += 60001;
  await call();
  assert.equal(calls.filter(call => call.table === 'tag_dictionary').length, 2);
});

test('oversized data fails before exceeding the deployment response limit', async () => {
  const { call } = setup({ contents: [work(1, { synopsis: 'x'.repeat(4_100_000) })] });
  const response = await call();
  assert.equal(response.status, 503);
  assert.ok(Buffer.byteLength(await response.text()) < 1000);
});

test('Vercel route exports the live GET handler', () => {
  assert.equal(typeof GET, 'function');
});
