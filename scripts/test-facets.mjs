import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchesSelectedTags, facetCounts} from '../public/facets.js';
const {items} = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));
test('판타지 + 액션 + 모험 requires all three selected tags', () => {
  const selection = {genre: ['판타지', '액션', '모험'], setting: [], relationship: []};
  const work = tags => ({tagGroups: {genre: tags}});
  assert.equal(matchesSelectedTags(work(['판타지', '액션', '모험']), selection), true);
  assert.equal(matchesSelectedTags(work(['판타지', '액션']), selection), false);
  assert.equal(matchesSelectedTags(work(['모험']), selection), false);
});
test('all categories narrow together and counters describe the resulting pool', () => {
  const base = items.filter(i => i.adult !== true);
  const selected = {genre: ['판타지', '액션'], setting: [], relationship: []};
  const first = base.filter(i => matchesSelectedTags(i, selected));
  assert.ok(first.length > 0 && first.length < base.length);
  const setting = [...facetCounts('setting', first)].sort((a,b) => b[1]-a[1])[0];
  selected.setting = [setting[0]];
  const second = first.filter(i => matchesSelectedTags(i, selected));
  assert.equal(second.length, setting[1]);
  const relationship = [...facetCounts('relationship', second)].sort((a,b) => b[1]-a[1])[0];
  selected.relationship = [relationship[0]];
  const final = base.filter(i => matchesSelectedTags(i, selected));
  assert.equal(final.length, relationship[1]);
  for (const [group, labels] of Object.entries(selected)) {
    const counts = facetCounts(group, final);
    for (const label of labels) assert.equal(counts.get(label), final.length);
  }
  assert.equal(facetCounts('genre', final).get('존재하지 않는 태그') || 0, 0);
  assert.ok(final.length <= second.length && second.length <= first.length);
});
