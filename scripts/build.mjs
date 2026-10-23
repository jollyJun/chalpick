import { cp, mkdir, readFile, rm, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogPage } from '../server/catalog.mjs';
import { readCatalogRelease, refreshCatalogRelease } from './catalog-release.mjs';
const root = new URL('../', import.meta.url);
const projectPath=path.resolve(fileURLToPath(root));
const publicPath=path.resolve(projectPath,'public');
const excludedFiles=new Set(['data/catalog.json','data/catalog-manifest.json','data/taxonomy.json','data/context-tags.json']);
const hasConfiguration=Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
if(process.env.VERCEL && !hasConfiguration) throw new Error('Vercel 배포에는 SUPABASE_URL과 공개 키를 등록해야 합니다. 이전 DB 파일로 배포를 우회하지 않습니다.');
const {catalog,manifest}=hasConfiguration
  ? await refreshCatalogRelease({publicPath,readPage:offset=>loadCatalogPage(offset)})
  : await readCatalogRelease(publicPath);
console.log(`${hasConfiguration?'Refreshed live DB':'Verified local release'}: ${manifest.total} records, ${manifest.available} visible, generated ${manifest.generatedAt}.`);
const html=await readFile(path.join(publicPath,'index.html'),'utf8');
const popular=JSON.parse(await readFile(path.join(publicPath,'data/popular.json'),'utf8'));
const {prerenderHome}=await import('./prerender-home.mjs');
const renderedHTML=await prerenderHome({html,catalog,popular,publicPath,release:manifest});
if(typeof renderedHTML!=='string' || !renderedHTML.includes('<html')) throw new Error('Homepage prerender failed');
const outputPath=path.resolve(projectPath,'dist');
if (path.dirname(outputPath)!==projectPath || path.basename(outputPath)!=='dist') throw new Error('Invalid output directory');
const existing=await lstat(outputPath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(existing?.isSymbolicLink()) throw new Error('Output directory must not be a symbolic link');
await rm(outputPath,{recursive:true,force:true});
await mkdir(outputPath, { recursive:true });
await cp(publicPath, outputPath, { recursive:true, filter:source=>{
  const relative=path.relative(publicPath,source).split(path.sep).join('/');
  return !excludedFiles.has(relative) && !relative.endsWith('.pending') && (!/^data\/live-catalog\./.test(relative) || '/'+relative===manifest.catalogUrl);
} });
await writeFile(path.join(outputPath,'index.html'),renderedHTML);
console.log(`Build complete: pre-rendered homepage and verified CDN catalog (${manifest.bytes} bytes raw, ${manifest.brotliBytes} bytes Brotli). DB updates appear after a successful new deployment.`);
