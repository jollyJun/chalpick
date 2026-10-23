// Every selected tag is a requirement, across all three taxonomy groups.
export function matchesSelectedTags(item, selected = {}) {
  return Object.entries(selected).every(([group, tags]) =>
    tags.every(tag => (item.tagGroups?.[group] || []).includes(tag)));
}

export function facetCounts(group, items) {
  const counts = new Map();
  for (const item of items) {
    const labels = group === 'platform' ? (item.platforms || []).map(p => p.name) : item.tagGroups?.[group] || [];
    for (const label of new Set(labels)) counts.set(label, (counts.get(label) || 0) + 1);
  }
  return counts;
}
