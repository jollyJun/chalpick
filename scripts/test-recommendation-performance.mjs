import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCatalogRelease } from './catalog-release.mjs';
import * as optimized from '../public/recommendation.js';
import * as original from './recommendation-reference.mjs';

const { catalog } = await readCatalogRelease(fileURLToPath(new URL('../public/', import.meta.url)));
const ids = items => items.map(item => item.id);
const profiles = [optimized.SAMPLE_PROFILE, { preferredTags: ['로맨스', '첫사랑'], excludedTags: ['무림'] }];

test('all full-release recommendation flows preserve exact original ordering and diversity', () => {
  const seed = catalog.items.find(item => item.id === 74) || catalog.items[0];
  for (const profile of profiles) {
    assert.deepEqual(ids(optimized.sortByTaste(catalog.items, profile)), ids(original.sortByTaste(catalog.items, profile)));
    assert.deepEqual(ids(optimized.similarPicks(seed, catalog.items, profile, 20)), ids(original.similarPicks(seed, catalog.items, profile, 20)));
    assert.deepEqual(ids(optimized.discoveryPicks(catalog.items, profile, 20)), ids(original.discoveryPicks(catalog.items, profile, 20)));
    assert.deepEqual(ids(optimized.immersivePicks(catalog.items, profile, 20)), ids(original.immersivePicks(catalog.items, profile, 20)));
    assert.deepEqual(ids(optimized.themePicks(catalog.items, profile, 'autumn')), ids(original.themePicks(catalog.items, profile, 'autumn')));
  }
});

test('local normalization and score caches preserve aliases, repeated terms, stable ties and empty profiles', () => {
  const items = [
    { id: 4, title: 'first duplicate', tags: [' 액션 ', '무협', 'ＳＦ'], genre: '액션', type: '웹툰', adult: false },
    { id: 4, title: 'second duplicate', tags: [' 액션 ', '무협', 'ＳＦ'], genre: '액션', type: '웹툰', adult: false },
    { id: 2, tags: ['로맨스', '회귀'], genre: '로맨스', type: '영화', image: 'cover.jpg', description: '소개' },
    { id: 3, tags: ['무림·문파', '회귀'], genre: '판타지', type: '웹소설', adult: null },
    { id: 1, tags: ['액션'], genre: '액션', type: '웹툰', adult: true },
    { id: 5, tags: [], type: 'OTT' }
  ];
  for (const profile of [undefined, { preferredTags: [] }, { preferredTags: ['무림', '액션', '액션', ' sf '], excludedTags: [] }, { preferredTags: ['회귀'], excludedTags: ['무림'] }]) {
    assert.deepEqual(optimized.sortByTaste(items, profile), original.sortByTaste(items, profile));
    assert.deepEqual(optimized.discoveryPicks(items, profile, 10), original.discoveryPicks(items, profile, 10));
    assert.deepEqual(optimized.similarPicks(items[0], items, profile, 10), original.similarPicks(items[0], items, profile, 10));
    assert.deepEqual(optimized.immersivePicks(items, profile, 10), original.immersivePicks(items, profile, 10));
  }
});

test('cached scores never survive a call or hide mutations to profiles and work tags', () => {
  const items = [{ id: 1, tags: ['액션'], adult: false }, { id: 2, tags: ['로맨스'], adult: false }];
  const profile = { preferredTags: ['액션'], excludedTags: [] };
  assert.deepEqual(ids(optimized.sortByTaste(items, profile)), [1, 2]);
  profile.preferredTags = ['로맨스'];
  assert.deepEqual(ids(optimized.sortByTaste(items, profile)), [2, 1]);
  items[0].tags = ['로맨스'];
  items[1].tags = ['액션'];
  assert.deepEqual(ids(optimized.sortByTaste(items, profile)), [1, 2]);
  profile.excludedTags = ['로맨스'];
  assert.deepEqual(ids(optimized.sortByTaste(items, profile)), [2]);
});
