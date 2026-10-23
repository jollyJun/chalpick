import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PROFILE_KEY, SAMPLE_PROFILE, activateSampleProfile, loadProfile, saveProfile,
  matchesTag, tasteMatch, isEligible, sortByTaste, similarPicks, discoveryPicks,
  discoveryReason, immersivePicks, THEMES,
  themeById, matchesTheme, themePicks, sameCreatorWorks, sameNameCreatorCandidates,
} from '../public/recommendation.js';

const { items: catalog } = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));
const contexts = JSON.parse(await readFile(new URL('../public/data/context-tags.json', import.meta.url), 'utf8'));
const contextIndex = new Map(contexts.entries.map(entry => [entry.contentId, entry.tags]));
for (const item of catalog) item.contextTags = contextIndex.get(item.id) || [];
const byId = new Map(catalog.map(item => [item.id, item]));
const profile = preferredTags => ({ preferredTags, excludedTags: [] });
const sample = profile([...SAMPLE_PROFILE.preferredTags]);
function work(id, tags, options = {}) {
  const genre = options.genre || tags[0] || '기타';
  return { id, title: `작품 ${id}`, type: '웹툰', genre, tags,
    tagGroups: { genre: [genre], setting: [], relationship: [] },
    image: 'https://example.test/image.jpg', description: '작품 소개', adult: false,
    credits: [], ...options };
}
function credit(name, role, identityKey = null, identityConfidence = identityKey ? 'verified_external_id' : 'content_scoped') {
  return { name, role, identityKey, identityConfidence };
}
const ids = items => items.map(item => item.id);
const isTasteOrdered = (items, taste) => items.every((item, index) => index === 0 ||
  tasteMatch(items[index - 1], taste).score >= tasteMatch(item, taste).score);
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('eligibility excludes known adult works and excluded keyword aliases', () => {
  assert.equal(isEligible(work(1, ['액션'], { adult: true }), sample), false);
  assert.equal(isEligible(work(2, ['액션'], { adult: null }), sample), true);
  assert.equal(isEligible(work(3, ['무협']), { excludedTags: ['무림'] }), false);
  assert.equal(isEligible(work(4, ['로맨스']), sample), true);
});

test('무림 aliases include 무협 and 무림·문파; 회귀 is distinct from 환생', () => {
  assert.equal(matchesTag(work(1, ['무협']), '무림'), true);
  assert.equal(matchesTag(work(2, ['무림·문파']), '무림'), true);
  assert.equal(matchesTag(work(3, ['환생']), '회귀'), false);
  assert.equal(matchesTag(work(4, ['회귀']), '회귀'), true);
  assert.equal(matchesTag(byId.get(74), '무림'), true);
  assert.equal(matchesTag(byId.get(74), '회귀'), false);
});

test('taste match reports the requested keywords without inventing extra matches', () => {
  const result = tasteMatch(work(1, ['액션', '회귀', '환생']), sample);
  assert.deepEqual(result.matched, ['액션', '회귀']);
  assert.equal(result.score, 0.5);
  assert.equal(result.total, 4);
});

test('taste sort changes when the profile changes and preserves input order', () => {
  const pool = [work(1, ['로맨스']), work(2, ['액션', '무협']), work(3, ['액션'], { adult: true })];
  const original = ids(pool);
  assert.deepEqual(ids(sortByTaste(pool, profile(['액션']))), [2, 1]);
  assert.deepEqual(ids(sortByTaste(pool, profile(['로맨스']))), [1, 2]);
  assert.deepEqual(ids(pool), original);
  assert.notDeepEqual(ids(sortByTaste(catalog, sample).slice(0, 6)),
    ids(sortByTaste(catalog, profile(['로맨스', '첫사랑'])).slice(0, 6)));
});

test('temporary sample profile is activated for a first visit and recoverable malformed storage', () => {
  const storage = memoryStorage();
  const loaded = loadProfile(storage);
  assert.equal(loaded.temporary, true);
  assert.deepEqual(loaded.preferredTags, ['액션', '무림', '먼치킨', '회귀']);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).id, SAMPLE_PROFILE.id);
  const activated = activateSampleProfile(storage);
  activated.preferredTags.push('로맨스');
  assert.equal(SAMPLE_PROFILE.preferredTags.includes('로맨스'), false);
  assert.deepEqual(loadProfile(memoryStorage({ [PROFILE_KEY]: '{bad json' })).preferredTags, SAMPLE_PROFILE.preferredTags);
});

test('saving and loading a different profile keeps its actual selected keywords', () => {
  const storage = memoryStorage();
  saveProfile({ name: '로맨스 독자', preferredTags: ['로맨스', '첫사랑', '로맨스'], temporary: false }, storage);
  assert.deepEqual(loadProfile(storage).preferredTags, ['로맨스', '첫사랑']);
  assert.equal(loadProfile(storage).temporary, false);
  assert.throws(() => saveProfile({ preferredTags: ['  '] }, storage), /하나 이상/);
});

test('similar picks exclude the original work, adult works, and unrelated works', () => {
  const seed = work(1, ['액션']);
  const related = work(2, ['액션']);
  const unrelated = work(3, ['로맨스']);
  const adult = work(4, ['액션'], { adult: true });
  assert.deepEqual(ids(similarPicks(seed, [seed, related, unrelated, adult], sample)), [2]);
  const actual = similarPicks(byId.get(74), catalog, sample, 6);
  assert.equal(actual.length, 6);
  assert.ok(actual.every(item => item.id !== 74 && item.adult !== true));
  assert.equal(new Set(ids(actual)).size, actual.length);
});

test('discovery works with fewer than 24 candidates and keeps a taste bridge', () => {
  const pool = [
    work(1, ['액션', '무협', '먼치킨', '회귀']),
    work(2, ['액션', '무협', '먼치킨', '회귀']),
    work(3, ['액션', '무협', '먼치킨', '회귀']),
    work(4, ['액션', '스릴러'], { type: '영화', genre: '스릴러' }),
    work(5, ['액션', '휴먼 드라마'], { type: '드라마', genre: '휴먼 드라마' }),
    work(6, ['액션', 'SF'], { type: '애니메이션', genre: 'SF' }),
    work(7, ['회귀', '판타지'], { type: '웹소설', genre: '판타지' }),
    work(8, ['먼치킨', '판타지'], { type: '웹툰', genre: '판타지' }),
    work(9, ['회귀', '미스터리'], { type: 'OTT', genre: '미스터리' }),
    work(10, ['회귀'], { adult: true }),
  ];
  const picks = discoveryPicks(pool, sample, 6);
  assert.equal(picks.length, 6);
  assert.ok(picks.every(item => ![1, 2, 3, 10].includes(item.id)));
  assert.ok(picks.every(item => tasteMatch(item, sample).score > 0));
  assert.ok(new Set(picks.map(item => item.type)).size >= 3);
  assert.equal(new Set(ids(picks)).size, picks.length);
});

test('one-keyword profiles can discover new genres or media instead of returning an impossible empty list', () => {
  const pool = [work(1, ['액션']),
    work(2, ['액션', '스릴러'], { type: '영화', genre: '스릴러' }),
    work(3, ['액션', '판타지'], { type: '웹소설', genre: '판타지' })];
  const picks = discoveryPicks(pool, profile(['액션']));
  assert.deepEqual(new Set(ids(picks)), new Set([2, 3]));
  assert.deepEqual(discoveryPicks([], sample), []);
});

test('real catalog discovery offers distinct media and genres without adult works', () => {
  const picks = discoveryPicks(catalog, sample, 6);
  assert.equal(picks.length, 6);
  assert.ok(picks.every(item => item.adult !== true && tasteMatch(item, sample).score > 0));
  assert.ok(new Set(picks.map(item => item.type)).size >= 2);
  assert.ok(new Set(picks.map(item => item.genre)).size >= 3);
  assert.ok(picks.every(item => discoveryReason(item, sample).includes(' → ')));
});

test('screen-media same-creator matching requires director credits on both sides', () => {
  const seed = work(1, [], { type: '영화', credits: [credit('감독 A', 'DIRECTOR', 'person:d'), credit('각본 B', 'SCREENWRITER', 'person:w')] });
  const pool = [seed,
    work(2, [], { type: '드라마', credits: [credit('감독 A', 'DIRECTOR', 'person:d')] }),
    work(3, [], { type: '영화', credits: [credit('각본 B', 'SCREENWRITER', 'person:w')] }),
    work(4, [], { type: '영화', credits: [credit('감독 A', 'LEAD_ACTOR', 'person:d')] }),
    work(5, [], { type: '영화', credits: [credit('공동 계정', 'DIRECTOR', 'person:d', 'collective_account')] }),
    work(6, [], { type: '웹툰', credits: [credit('감독 A', 'STORY_WRITER', 'person:d')] }),
    work(7, [], { type: '영화', adult: true, credits: [credit('감독 A', 'DIRECTOR', 'person:d')] }),
  ];
  assert.deepEqual(sameCreatorWorks(seed, pool).map(row => row.item.id), [2]);
});

test('webtoon and novel same-creator matching uses only the four supported author roles', () => {
  const seed = work(1, [], { credits: [credit('작가', 'STORY_WRITER', 'artist:a')] });
  const pool = [seed,
    work(2, [], { type: '웹소설', credits: [credit('작가', 'ORIGINAL_AUTHOR', 'artist:a')] }),
    work(3, [], { credits: [credit('작가', 'LEAD_ARTIST', 'artist:a')] }),
    work(4, [], { credits: [credit('작가', 'ADAPTATION_WRITER', 'artist:a')] }),
    work(5, [], { credits: [credit('작가', 'SCREENWRITER', 'artist:a')] }),
    work(6, [], { type: '영화', credits: [credit('작가', 'DIRECTOR', 'artist:a')] }),
  ];
  assert.deepEqual(sameCreatorWorks(seed, pool).map(row => row.item.id), [2, 3, 4]);
});

test('same-name director candidates exclude screenwriters, adult works, and collective accounts', () => {
  const seed = work(1, [], { type: '영화', credits: [credit('홍 길동', 'DIRECTOR'), credit('각본가', 'SCREENWRITER')] });
  const pool = [seed,
    work(2, [], { type: '드라마', credits: [credit('홍길동', 'DIRECTOR')] }),
    work(3, [], { type: '영화', credits: [credit('각본가', 'SCREENWRITER')] }),
    work(4, [], { type: '영화', credits: [credit('홍길동', 'DIRECTOR', null, 'collective_account')] }),
    work(5, [], { type: '영화', adult: true, credits: [credit('홍길동', 'DIRECTOR')] }),
  ];
  assert.deepEqual(sameNameCreatorCandidates(seed, pool).map(row => row.item.id), [2]);
  const collective = { ...seed, credits: [credit('홍길동', 'DIRECTOR', null, 'collective_account')] };
  assert.deepEqual(sameNameCreatorCandidates(collective, pool), []);
});

test('actual 화산귀환 creator matches have shared official identity and supported author roles', () => {
  const seed = byId.get(74);
  const matches = sameCreatorWorks(seed, catalog);
  const keys = new Set(seed.credits.map(row => row.identityKey).filter(Boolean));
  const allowed = new Set(['STORY_WRITER', 'LEAD_ARTIST', 'ORIGINAL_AUTHOR', 'ADAPTATION_WRITER']);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(row => row.item.id !== 74 && row.item.adult !== true));
  assert.ok(matches.every(row => row.matches.every(person => keys.has(person.identityKey) && allowed.has(person.role))));
});

test('actual 헤어질 결심 director candidates do not inherit its screenplay co-writers', () => {
  const seed = byId.get(56);
  const directorNames = new Set(seed.credits.filter(row => row.role === 'DIRECTOR').map(row => row.name.replace(/\s/g, '')));
  const candidates = sameNameCreatorCandidates(seed, catalog);
  assert.ok(directorNames.size > 0);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(row => row.item.id !== 56 && row.item.adult !== true));
  assert.ok(candidates.every(row => row.matches.every(person => person.role === 'DIRECTOR' && directorNames.has(person.name.replace(/\s/g, '')))));
});

test('theme results are filtered first and then ordered by the active taste profile', () => {
  for (const theme of THEMES) {
    const picks = themePicks(catalog, sample, theme.id);
    assert.ok(picks.every(item => item.adult !== true && matchesTheme(item, theme)), theme.id);
    assert.ok(isTasteOrdered(picks, sample), theme.id);
  }
  assert.ok(isTasteOrdered(immersivePicks(catalog, sample, 12), sample));
});

test('seasonal matches require explicit curation rather than general genre labels', () => {
  const autumn = themeById('autumn');
  assert.equal(matchesTheme(work(1, ['성장물','휴먼 드라마','미스터리','재회']), autumn), false);
  const autumnWorks = catalog.filter(item => matchesTheme(item, autumn));
  assert.ok(autumnWorks.length >= 6);
  assert.ok(autumnWorks.every(item => contextIndex.get(item.id)?.includes('autumn')));
  assert.ok(!THEMES.some(theme => ['day','night','clear'].includes(theme.id)));
});
