import { readFile, writeFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));
const ratings = Object.fromEntries(catalog.items.filter(item => item.adult !== null).map(item => [item.id, { title: item.title, adult: item.adult, age: item.age }]));
await writeFile(new URL('../server/catalog-age-ratings.json', import.meta.url), JSON.stringify(ratings));
console.log(`Preserved ${Object.keys(ratings).length} title-bound known age ratings; no catalog content exported.`);
