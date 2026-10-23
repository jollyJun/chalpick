import { fileURLToPath } from 'node:url';
import { loadCatalogPage } from '../server/catalog.mjs';
import { refreshCatalogRelease } from './catalog-release.mjs';

const publicPath = fileURLToPath(new URL('../public/', import.meta.url));
const release = await refreshCatalogRelease({ publicPath, readPage: offset => loadCatalogPage(offset), onProgress: ({ loaded, total }) => console.log(`Verified DB records: ${loaded}/${total}`) });
console.log(JSON.stringify(release.manifest, null, 2));
