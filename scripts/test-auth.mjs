import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAuth, handleNodeAuth } from '../server/auth.mjs';

const ORIGIN = 'https://chalpick.kr';
const CLOCK = Date.UTC(2026, 9, 22, 0, 0, 0);
const ENV = { AUTH_BASE_URL: ORIGIN, AUTH_SESSION_SECRET: Buffer.alloc(32, 17).toString('base64url'), NAVER_CLIENT_ID: 'test-naver-id', NAVER_CLIENT_SECRET: 'test-naver-secret', KAKAO_CLIENT_ID: 'test-kakao-id', KAKAO_CLIENT_SECRET: 'test-kakao-secret' };
const mutation = { origin: ORIGIN, 'content-type': 'application/json', 'x-chalpick-auth': '1', 'sec-fetch-site': 'same-origin' };
const cookiePairs = response => response.headers.getSetCookie().filter(value => !value.includes('Max-Age=0')).map(value => value.split(';')[0]).join('; ');
const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith('__Host-chalpick_session='))?.split(';')[0];
function req(action, { provider, method = ['start', 'logout'].includes(action) ? 'POST' : 'GET', headers = {}, params = {}, origin = ORIGIN } = {}) {
  const url = new URL('/api/auth', origin); url.searchParams.set('action', action);
  if (provider) url.searchParams.set('provider', provider);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return new Request(url, { method, headers: { ...(method === 'POST' ? mutation : {}), ...headers } });
}
function call(request, options = {}) { return handleAuth(request, { env: ENV, now: () => CLOCK, fetchImpl: () => { throw new Error('Unexpected provider request'); }, ...options }); }
async function start(provider = 'naver', options = {}) {
  const result = await call(req('start', { provider }), options);
  assert.equal(result.status, 200);
  const url = new URL((await result.json()).authorizationUrl);
  return { response: result, cookie: cookiePairs(result), state: url.searchParams.get('state'), url };
}
function providerMock(provider, overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/token')) return Response.json(overrides.tokens ?? { access_token: 'server-only-access', refresh_token: 'server-only-refresh', token_type: 'bearer' });
    return Response.json(overrides.profile ?? (provider === 'naver' ? { resultcode: '00', response: { id: 'naver-member-123', nickname: '<이름 & 닉네임>', email: 'unneeded@example.invalid', profile_image: 'https://unused.invalid/avatar.png' } } : { id: 123456, kakao_account: { profile: { nickname: '카카오 친구' }, email: 'unneeded@example.invalid' } }));
  };
  return { calls, fetchImpl };
}
async function finish(provider = 'naver', options = {}) {
  const flow = await start(provider), mocked = providerMock(provider, options);
  const result = await call(req('callback', { provider, headers: { cookie: flow.cookie }, params: { state: flow.state, code: 'single-use-provider-code' } }), { fetchImpl: mocked.fetchImpl });
  return { flow, mocked, result };
}

test('unconfigured providers stay unavailable and cannot create a login', async () => {
  const status = await call(req('status'), { env: {} });
  assert.equal(status.status, 200); const body = await status.json();
  assert.equal(body.authenticated, false); assert.equal(body.available, false); assert.ok(body.providers.every(provider => provider.enabled === false));
  const startResult = await call(req('start', { provider: 'naver' }), { env: {} });
  assert.equal(startResult.status, 503); assert.equal(startResult.headers.getSetCookie().length, 0);
});

test('weak secret, missing secret and production HTTP configuration fail closed', async () => {
  for (const env of [{ ...ENV, AUTH_SESSION_SECRET: 'short' }, { ...ENV, KAKAO_CLIENT_SECRET: '' }, { ...ENV, AUTH_BASE_URL: 'http://localhost:4173', NODE_ENV: 'production' }]) {
    const result = await call(req('status'), { env }); const body = await result.json();
    assert.equal(body.providers.find(provider => provider.id === 'kakao').enabled, false);
  }
});

test('start is POST-only and requires same-origin JSON and the intent header', async () => {
  assert.equal((await call(req('start', { provider: 'naver', method: 'GET' }))).status, 405);
  for (const headers of [{ origin: 'https://evil.invalid' }, { origin: '' }, { 'x-chalpick-auth': '' }, { 'content-type': 'text/plain' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await call(req('start', { provider: 'naver', headers }))).status, 403);
});

test('authorization URL uses fixed origin and contains no client secret', async () => {
  const { response, url, state } = await start();
  assert.equal(url.origin, 'https://nid.naver.com');
  assert.equal(url.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth?action=callback&provider=naver`);
  assert.match(state, /^[A-Za-z0-9_-]{43}$/); assert.equal(url.searchParams.has('client_secret'), false);
  const value = response.headers.getSetCookie()[0];
  assert.match(value, /^__Host-chalpick_oauth_naver=/); assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Lax/); assert.match(value, /Secure/); assert.match(value, /Path=\//); assert.doesNotMatch(value, /Domain=/); assert.equal(value.includes(state), false);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('each login attempt has independent cryptographically random state', async () => {
  const a = await start(), b = await start(); assert.notEqual(a.state, b.state); assert.notEqual(a.cookie, b.cookie);
});

test('Kakao requests only nickname scope', async () => {
  const { url } = await start('kakao'); assert.equal(url.origin, 'https://kauth.kakao.com'); assert.equal(url.searchParams.get('scope'), 'profile_nickname');
});

test('missing state or missing browser cookie is rejected before provider calls', async () => {
  const flow = await start();
  for (const options of [{ headers: { cookie: flow.cookie }, params: { code: 'code' } }, { params: { code: 'code', state: flow.state } }]) {
    const result = await call(req('callback', { provider: 'naver', ...options })); assert.equal(result.status, 303); assert.match(result.headers.get('location'), /auth_error=invalid_state/); assert.ok(result.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  }
});

test('mismatching state and tampered state cookie are rejected', async () => {
  const flow = await start();
  for (const [cookie, state] of [[flow.cookie, 'incorrect-state'], [flow.cookie.replace('=v1.', '=v2.'), flow.state]]) {
    const result = await call(req('callback', { provider: 'naver', headers: { cookie }, params: { code: 'code', state } })); assert.match(result.headers.get('location'), /auth_error=invalid_state/);
  }
});

test('expired state is rejected at the ten-minute boundary', async () => {
  const flow = await start(); const result = await call(req('callback', { provider: 'naver', headers: { cookie: flow.cookie }, params: { code: 'code', state: flow.state } }), { now: () => CLOCK + 600_000 });
  assert.match(result.headers.get('location'), /auth_error=invalid_state/);
});

test('state cannot move between providers or duplicate cookies', async () => {
  const flow = await start();
  const switched = flow.cookie.replace('oauth_naver=', 'oauth_kakao=');
  const result = await call(req('callback', { provider: 'kakao', headers: { cookie: switched }, params: { code: 'code', state: flow.state } })); assert.match(result.headers.get('location'), /invalid_state/);
  const duplicated = await call(req('callback', { provider: 'naver', headers: { cookie: `${flow.cookie}; ${flow.cookie}` }, params: { code: 'code', state: flow.state } })); assert.match(duplicated.headers.get('location'), /invalid_state/);
});

test('provider cancellation and missing code clear state without a session', async () => {
  const flow = await start();
  for (const [params, reason] of [[{ state: flow.state, error: 'access_denied' }, 'cancelled'], [{ state: flow.state }, 'invalid_response']]) {
    const result = await call(req('callback', { provider: 'naver', headers: { cookie: flow.cookie }, params })); assert.match(result.headers.get('location'), new RegExp(reason)); assert.equal(sessionCookie(result), undefined);
  }
});

for (const provider of ['naver', 'kakao']) test(`${provider} exchanges code server-side and issues a minimal encrypted session`, async () => {
  const { mocked, result, flow } = await finish(provider);
  assert.equal(result.status, 303); assert.equal(result.headers.get('location'), `${ORIGIN}/?auth=success`);
  assert.equal(mocked.calls.length, 2); const tokenRequest = mocked.calls[0];
  assert.equal(tokenRequest.options.method, 'POST'); assert.equal(tokenRequest.options.redirect, 'error'); assert.equal(tokenRequest.options.body.get('client_secret'), ENV[`${provider.toUpperCase()}_CLIENT_SECRET`]);
  assert.equal(tokenRequest.options.body.get('redirect_uri'), flow.url.searchParams.get('redirect_uri'));
  if (provider === 'naver') assert.equal(tokenRequest.options.body.get('state'), flow.state);
  assert.equal(mocked.calls[1].options.headers.Authorization, 'Bearer server-only-access');
  if (provider === 'kakao') assert.deepEqual(JSON.parse(new URL(mocked.calls[1].url).searchParams.get('property_keys')), ['kakao_account.profile.nickname']);
  const session = sessionCookie(result); assert.ok(session); assert.doesNotMatch(session, /server-only|naver-member|카카오|unneeded|email|refresh_token/);
  const status = await call(req('session', { headers: { cookie: session } })); const body = await status.json();
  assert.equal(body.authenticated, true); assert.equal(body.user.provider, provider); assert.deepEqual(Object.keys(body.user).sort(), ['id', 'name', 'provider']);
  assert.equal(result.headers.getSetCookie().filter(value => value.includes('Max-Age=0')).length, 1);
});

test('provider token failure, invalid identity and HTTP errors never issue sessions', async () => {
  const flow = await start();
  for (const fetchImpl of [providerMock('naver', { tokens: { error: 'invalid_grant' } }).fetchImpl, providerMock('naver', { profile: { resultcode: '00', response: { nickname: 'no identity' } } }).fetchImpl, async () => new Response('error with secret details', { status: 500 })]) {
    const result = await call(req('callback', { provider: 'naver', headers: { cookie: flow.cookie }, params: { state: flow.state, code: 'code' } }), { fetchImpl });
    assert.match(result.headers.get('location'), /auth_error=provider_error/); assert.equal(sessionCookie(result), undefined); assert.equal((await result.text()).includes('secret details'), false);
  }
});

test('nickname absence still identifies the account without requesting email', async () => {
  const { result } = await finish('naver', { profile: { resultcode: '00', response: { id: 'member-no-nickname' } } });
  const status = await call(req('session', { headers: { cookie: sessionCookie(result) } })); const body = await status.json(); assert.equal(body.user.name, '네이버 회원');
});

test('forged session and cross-purpose state token are never authenticated', async () => {
  const { result, flow } = await finish(); const session = sessionCookie(result);
  const offset = session.indexOf('=v1.') + 4;
  const modified = session.slice(0, offset) + (session[offset] === 'A' ? 'B' : 'A') + session.slice(offset + 1);
  for (const cookie of [modified, `__Host-chalpick_session=${flow.cookie.split('=')[1]}`, '__Host-chalpick_session=admin', `${session}; ${session}`]) {
    const status = await call(req('session', { headers: { cookie } })); assert.equal((await status.json()).authenticated, false);
  }
});

test('session expires after one day and is invalid after secret rotation', async () => {
  const { result } = await finish(); const cookie = sessionCookie(result);
  for (const options of [{ now: () => CLOCK + 86_400_000 }, { env: { ...ENV, AUTH_SESSION_SECRET: Buffer.alloc(32, 23).toString('base64url') } }]) {
    const status = await call(req('session', { headers: { cookie } }), options); assert.equal((await status.json()).authenticated, false);
  }
});

test('logout is POST-only and rejects missing or foreign Origin', async () => {
  assert.equal((await call(req('logout', { method: 'GET' }))).status, 405);
  for (const headers of [{ origin: '' }, { origin: 'https://evil.invalid' }, { origin: 'https://sub.chalpick.kr' }, { 'x-chalpick-auth': '' }]) assert.equal((await call(req('logout', { headers }))).status, 403);
  const result = await call(req('logout'));
  assert.equal(result.status, 200); assert.equal((await result.json()).authenticated, false); assert.equal(result.headers.getSetCookie().length, 3); assert.ok(result.headers.getSetCookie().every(value => value.includes('Max-Age=0') && value.includes('HttpOnly') && value.includes('Secure')));
});

test('a consumed browser state cannot authenticate after its cookie is cleared', async () => {
  const { flow } = await finish(); const result = await call(req('callback', { provider: 'naver', params: { code: 'already-used-code', state: flow.state } })); assert.match(result.headers.get('location'), /invalid_state/);
});

test('captured callback replay cannot create a session when the provider rejects a used code', async () => {
  const flow = await start(); let exchanged = false;
  const mock = providerMock('naver');
  const fetchImpl = async (url, options) => {
    if (String(url).includes('/token')) {
      if (exchanged) return Response.json({ error: 'invalid_grant', error_description: 'already consumed code' }, { status: 400 });
      exchanged = true;
    }
    return mock.fetchImpl(url, options);
  };
  const callback = () => req('callback', { provider: 'naver', headers: { cookie: flow.cookie }, params: { code: 'one-use-code', state: flow.state } });
  assert.ok(sessionCookie(await call(callback(), { fetchImpl })));
  const replay = await call(callback(), { fetchImpl });
  assert.equal(sessionCookie(replay), undefined); assert.match(replay.headers.get('location'), /auth_error=provider_error/);
});

test('top-level cross-site GET callback is accepted with valid Lax state cookie', async () => {
  const flow = await start(); const mocked = providerMock('naver');
  const result = await call(req('callback', { provider: 'naver', headers: { cookie: flow.cookie, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }, params: { code: 'code', state: flow.state } }), { fetchImpl: mocked.fetchImpl });
  assert.ok(sessionCookie(result)); assert.match(result.headers.get('location'), /auth=success/);
});

test('malformed and provider-supplied error content never reaches the response', async () => {
  const flow = await start(); const untrusted = '<script>secret-provider-debug</script>';
  const result = await call(req('callback', { provider: 'naver', headers: { cookie: flow.cookie }, params: { state: flow.state, error: untrusted, error_description: untrusted } }));
  assert.match(result.headers.get('location'), /auth_error=provider_error/);
  assert.equal((await result.text()).includes('secret-provider-debug'), false);
  assert.equal(result.headers.get('location').includes('secret-provider-debug'), false);
  const malformed = await call(req('callback', { provider: 'naver', headers: { cookie: '%%invalid-state-cookie' }, params: { code: '\r\n', state: '%' } }));
  assert.match(malformed.headers.get('location'), /invalid_state/); assert.equal(sessionCookie(malformed), undefined);
});

test('host spoofing, arbitrary providers and duplicate parameters are rejected', async () => {
  assert.equal((await call(req('start', { provider: 'naver', origin: 'https://evil.invalid', headers: { 'x-forwarded-host': 'chalpick.kr' } }))).status, 503);
  for (const provider of ['evil', '__proto__', 'constructor']) assert.equal((await call(req('start', { provider }))).status, 400);
  const url = new URL(req('callback', { provider: 'naver' }).url); url.searchParams.append('provider', 'kakao'); assert.equal((await call(new Request(url))).status, 400);
});

test('untrusted return targets cannot alter the callback or final redirect', async () => {
  const response = await call(req('start', { provider: 'naver', params: { redirect_uri: 'https://evil.invalid', returnTo: '//evil.invalid' } })); const authURL = new URL((await response.json()).authorizationUrl); assert.equal(authURL.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth?action=callback&provider=naver`);
});

test('localhost uses host-only HttpOnly cookies and an explicit fixed callback', async () => {
  const env = { ...ENV, AUTH_BASE_URL: 'http://localhost:4173' };
  const result = await call(req('start', { provider: 'naver', origin: env.AUTH_BASE_URL, headers: { origin: env.AUTH_BASE_URL } }), { env });
  assert.equal(result.status, 200); const value = result.headers.getSetCookie()[0]; assert.match(value, /^chalpick_oauth_naver=/); assert.match(value, /HttpOnly/); assert.doesNotMatch(value, /; Secure/); assert.doesNotMatch(value, /Domain=/);
});

test('Node adapter serves the same endpoint with separate Set-Cookie headers', async () => {
  let env;
  const server = createServer((request, response) => handleNodeAuth(request, response, { env, now: () => CLOCK }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`; env = { ...ENV, AUTH_BASE_URL: origin };
    const status = await fetch(`${origin}/api/auth?action=status`); assert.equal((await status.json()).available, true);
    const logout = await fetch(`${origin}/api/auth?action=logout`, { method: 'POST', headers: { ...mutation, origin } });
    assert.equal(logout.status, 200); assert.equal(logout.headers.getSetCookie().length, 3);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
