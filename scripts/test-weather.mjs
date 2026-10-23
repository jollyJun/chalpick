import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { visitorRegion, weatherCondition, currentForecast, handleWeather, handleNodeWeather } from '../server/weather.mjs';

const CLOCK = Date.UTC(2026, 9, 22, 15, 30);
const GEO = { 'x-vercel-ip-latitude': '37.5665', 'x-vercel-ip-longitude': '126.9780', 'x-vercel-ip-city': 'Seoul', 'x-vercel-ip-country': 'KR' };
const ENV = { VERCEL: '1' };
const req = (headers = GEO, method = 'GET') => new Request('https://chalpick.kr/api/weather', { headers, method });
const payload = (symbol = 'rain', time = '2026-10-22T15:00:00Z') => ({ properties: { meta: { updated_at: '2026-10-22T13:00:00Z' }, timeseries: [{ time, data: { next_1_hours: { summary: { symbol_code: symbol } } } }] } });
function setup(overrides = {}) {
  const calls = [];
  const options = { env: ENV, now: () => CLOCK, cache: new Map(), pending: new Map(), fetchImpl: async (url, init) => { calls.push({ url: new URL(url), init }); return Response.json(payload(), { headers: { Expires: new Date(CLOCK + 10 * 60 * 1000).toUTCString(), 'Last-Modified': new Date(CLOCK - 60 * 60 * 1000).toUTCString() } }); }, ...overrides };
  return { options, calls, call: request => handleWeather(request || req(), options) };
}

test('visitor location uses Vercel geo headers and reduces coordinates to an approximate region', () => {
  assert.deepEqual(visitorRegion(req(), ENV), { latitude: 37.6, longitude: 127, region: '서울' });
  assert.equal(visitorRegion(req(), {}), null);
  assert.equal(visitorRegion(req({}), ENV), null);
});

test('invalid and missing coordinates cannot trigger a weather request', async () => {
  for (const value of ['', ' ', 'NaN', 'Infinity', '91']) {
    const { call, calls } = setup();
    const result = await (await call(req({ ...GEO, 'x-vercel-ip-latitude': value }))).json();
    assert.equal(result.available, false); assert.equal(result.reason, 'region_unavailable'); assert.equal(calls.length, 0);
  }
});

test('region labels decode safely and fall back to Korean region codes', () => {
  assert.equal(visitorRegion(req({ ...GEO, 'x-vercel-ip-city': encodeURIComponent('수원') }), ENV).region, '수원');
  assert.equal(visitorRegion(req({ ...GEO, 'x-vercel-ip-city': '%not-valid', 'x-vercel-ip-country-region': '41' }), ENV).region, '경기');
  assert.equal(visitorRegion(req({ ...GEO, 'x-vercel-ip-city': '<Seoul>' }), ENV).region, '서울');
});

test('only rain, thunder and snow/sleet produce weather themes', () => {
  for (const symbol of ['rain', 'heavyrainandthunder', 'lightrainshowers_day', 'rainshowers_night']) assert.equal(weatherCondition(symbol), 'rain');
  for (const symbol of ['snow', 'heavysnowandthunder', 'lightsnowshowers_day', 'sleet']) assert.equal(weatherCondition(symbol), 'snow');
  for (const symbol of ['clearsky_day', 'partlycloudy_night', 'cloudy', 'fair_day', 'fog', null]) assert.equal(weatherCondition(symbol), null);
});

test('weather selection uses the period containing now, not a distant rainy period', () => {
  const future = payload('rain', '2026-10-22T16:00:00Z');
  future.properties.timeseries.unshift(...payload('cloudy').properties.timeseries);
  assert.equal(currentForecast(future, CLOCK).condition, null);
  assert.equal(currentForecast(payload('rain', '2026-10-22T14:00:00Z'), CLOCK), null);
  assert.equal(currentForecast(payload('rain', '2026-10-22T16:00:00Z'), CLOCK), null);
  assert.equal(currentForecast(payload(), Date.UTC(2026, 9, 22, 16)), null);
  assert.equal(currentForecast(payload(), Date.UTC(2026, 9, 22, 15)).condition, 'rain');
});

test('six-hour-only forecasts are not presented as current rainfall', () => {
  const data = payload();
  data.properties.timeseries[0].data.next_6_hours = data.properties.timeseries[0].data.next_1_hours;
  delete data.properties.timeseries[0].data.next_1_hours;
  assert.equal(currentForecast(data, CLOCK), null);
});

test('proxy sends only rounded coordinates and application identification, with a timeout', async () => {
  const { call, calls } = setup();
  const response = await call(req({ ...GEO, 'x-forwarded-for': '203.0.113.1', cookie: 'private=user-session' }));
  const data = await response.json();
  assert.equal(data.available, true); assert.equal(data.condition, 'rain'); assert.equal(data.isForecast, true); assert.equal(data.region, '서울');
  assert.equal(data.source.license, 'CC BY 4.0');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(calls[0].url.origin, 'https://api.met.no');
  assert.equal(calls[0].url.search, '?lat=37.6&lon=127.0');
  assert.deepEqual(Object.keys(calls[0].init.headers), ['User-Agent']);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal('latitude' in data, false); assert.equal('ip' in data, false);
});

test('dry weather is known but never becomes a rain or snow theme', async () => {
  const { call } = setup({ fetchImpl: async () => Response.json(payload('clearsky_day')) });
  const data = await (await call()).json();
  assert.equal(data.available, true); assert.equal(data.condition, null);
});

test('fresh forecasts are reused until provider Expires; labels are not shared across visitors', async () => {
  const { call, calls } = setup();
  await call();
  const data = await (await call(req({ ...GEO, 'x-vercel-ip-city': 'Nearby City' }))).json();
  assert.equal(calls.length, 1); assert.equal(data.region, 'Nearby City');
});

test('simultaneous visitors on the same geographic grid share an upstream call', async () => {
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const { call } = setup({ fetchImpl: async () => { calls++; await pending; return Response.json(payload()); } });
  const first = call(), second = call(); release();
  await Promise.all([first, second]); assert.equal(calls, 1);
});

test('expired cached data revalidates with Last-Modified and respects 304', async () => {
  let now = CLOCK, callCount = 0, conditional;
  const modified = 'Thu, 22 Oct 2026 13:00:00 GMT';
  const { call } = setup({ now: () => now, fetchImpl: async (url, init) => {
    callCount++;
    if (callCount === 1) return Response.json(payload(), { headers: { Expires: new Date(now + 1000).toUTCString(), 'Last-Modified': modified } });
    conditional = init.headers['If-Modified-Since'];
    return new Response(null, { status: 304, headers: { Expires: new Date(now + 600000).toUTCString() } });
  } });
  await call(); now += 2000;
  assert.equal((await (await call()).json()).condition, 'rain');
  await call(); assert.equal(conditional, modified); assert.equal(callCount, 2);
});

test('429 backs off according to Retry-After and fails closed', async () => {
  let calls = 0, now = CLOCK;
  const { call } = setup({ now: () => now, fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '600' } }); } });
  assert.equal((await (await call()).json()).available, false);
  now += 300000; await call(); assert.equal(calls, 1);
  now += 300001; await call(); assert.equal(calls, 2);
});

test('network failure, bad JSON and missing forecast data never manufacture weather', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response('bad json'), async () => Response.json({}), async () => Response.json(payload('rain', '2026-10-21T15:00:00Z'))]) {
    const { call } = setup({ fetchImpl });
    const response = await call(), data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.available, false); assert.equal(data.condition, null); assert.equal(data.region, '서울');
  }
});

test('unsupported methods never call the provider', async () => {
  const { call, calls } = setup();
  const response = await call(req(GEO, 'POST'));
  assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET'); assert.equal(calls.length, 0);
});

test('local HTTP route ignores spoofed Vercel location headers', async t => {
  const server = createServer((request, response) => handleNodeWeather(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weather`, { headers: GEO });
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.reason, 'region_unavailable'); assert.equal(data.available, false); assert.equal(data.region, null);
});
