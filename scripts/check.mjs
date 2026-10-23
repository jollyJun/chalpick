import { readFile, access, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { THEMES } from '../public/context.js';

const project = new URL('../', import.meta.url);
const root = new URL('public/', project);
const json = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const popular = await json('data/popular.json');
const validURL = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };
assert.equal(new Set(THEMES.map(theme => theme.id)).size, THEMES.length, '기념일·날씨·계절 식별자 중복 없음');
assert.ok(Array.isArray(popular.lists), '공식 플랫폼 순위 목록');
for (const list of popular.lists) {
  assert.ok(list.id && list.label && validURL(list.sourceUrl), '인기 목록의 명칭과 공식 근거 주소');
  assert.ok(Array.isArray(list.entries), '인기 목록 항목 배열');
  if (list.status === 'unavailable') assert.equal(list.entries.length, 0, '확인하지 못한 순위는 만들지 않음');
  let previousRank = 0;
  for (const entry of list.entries) {
    assert.ok(Number.isInteger(entry.rank) && entry.rank > 0 && entry.rank >= previousRank, '공식 순위 순서 유지');
    previousRank = entry.rank;
    assert.ok(typeof entry.title === 'string' && entry.title, '순위 작품명');
    assert.ok(entry.catalogId === null || (Number.isSafeInteger(entry.catalogId) && entry.catalogId > 0), '인기 목록 작품 ID');
    if (entry.url) assert.ok(validURL(entry.url), '인기 목록 작품 주소');
  }
}

const html = await readFile(new URL('index.html', root), 'utf8');
assert.ok(!html.includes('누구의 취향'), '삭제 요청 영역 없음');
assert.ok(!/href=["']#["']/.test(html), '빈 링크 없음');
for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
  let pathname = match[1].slice(1);
  if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
  await access(new URL(pathname, root));
}
for (const file of ['assets/ad-wide.svg', 'assets/ad-square.svg']) {
  const svg = await readFile(new URL(file, root), 'utf8');
  assert.ok(svg.includes('여기가 광고하는 자리입니다'));
  assert.ok(svg.includes('fill="#fff"'));
}
const app = await readFile(new URL('app.js', root), 'utf8');
const client = await readFile(new URL('catalog-client.js', root), 'utf8');
assert.ok(app.includes('loadLiveCatalog'), '화면은 실시간 카탈로그 클라이언트 사용');
assert.ok(client.includes('/api/catalog?offset='), '전체 DB 카탈로그 페이지 순회');
assert.ok(!/\/data\/(?:catalog|catalog-manifest|taxonomy|context-tags)\.json/.test(app + client), '예전 정적 카탈로그 및 우회 복구 경로 없음');
assert.ok(!/SUPABASE_|sb_(?:secret|publishable)_/.test(app + client), '브라우저 코드에 DB 연결 설정 없음');

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) output.push(...await filesUnder(file));
    else output.push(file);
  }
  return output;
}
const publicFiles = await filesUnder(root);
for (const file of publicFiles) {
  assert.ok(!/(?:^|\/)(?:\.env[^/]*|[^/]*\.private\.[^/]*|source-audit\.json|catalog-age-ratings\.json)$/i.test(decodeURIComponent(file.pathname)), '비공개 설정/감사 자료는 공개 파일에서 제외');
  if (/\.(?:m?js|html|css)$/i.test(file.pathname)) {
    const source = await readFile(file, 'utf8');
    assert.ok(!/sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(source), '공개 파일에 비밀키 없음');
  }
}
for (const file of ['api/auth.js', 'server/auth.mjs', 'api/catalog.js', 'server/catalog.mjs', 'server/catalog-model.mjs', 'server/catalog-age-ratings.json', 'public/catalog-client.js', 'public/assets/adult-placeholder.svg', 'public/auth.js', 'public/auth.css', 'public/recommendation.js']) await access(new URL(file, project));
const sourceFiles = [...publicFiles, ...await filesUnder(new URL('api/', project)), ...await filesUnder(new URL('server/', project)), ...await filesUnder(new URL('scripts/', project))].filter(file => /\.m?js$/.test(file.pathname));
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${fileURLToPath(file)} 구문 오류:\n${result.stderr || result.error?.message || ''}`);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*['"]([.][^'"]+)['"]/g)) await access(new URL(match[1], file));
}
console.log(`Passed: live catalog API wiring, ${popular.lists.length} sourced ranking lists, ${sourceFiles.length} JavaScript modules, public-file safety and local references. Database availability is verified separately; no legacy row-count assumption is used.`);
