import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCatalogRelease } from './catalog-release.mjs';
import * as optimized from '../public/recommendation.js';
import * as original from './recommendation-reference.mjs';

const { catalog } = await readCatalogRelease(fileURLToPath(new URL('../public/', import.meta.url)));
const profile = optimized.SAMPLE_PROFILE, seed = catalog.items.find(item => item.id === 74) || catalog.items[0];
const flows = [
  ['sortByTaste', [catalog.items, profile]],
  ['discoveryPicks', [catalog.items, profile, 6]],
  ['immersivePicks', [catalog.items, profile, 6]],
  ['themePicks', [catalog.items, profile, 'autumn']],
  ['similarPicks', [seed, catalog.items, profile, 6]]
];
const results = [];
for (const [name, parameters] of flows) {
  original[name](...parameters);
  optimized[name](...parameters);
  const beforeStart = performance.now(), before = original[name](...parameters), beforeMs = performance.now() - beforeStart;
  const afterStart = performance.now(), after = optimized[name](...parameters), afterMs = performance.now() - afterStart;
  assert.deepEqual(after.map(item => item.id), before.map(item => item.id));
  results.push({ flow: name, originalMs: +beforeMs.toFixed(2), optimizedMs: +afterMs.toFixed(2), speedup: +(beforeMs / afterMs).toFixed(1), identical: true });
}
console.log(JSON.stringify({ total: catalog.items.length, generatedAt: catalog.meta.generatedAt, results }, null, 2));
