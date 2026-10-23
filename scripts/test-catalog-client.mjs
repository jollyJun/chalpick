import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadLiveCatalog,loadFastCatalog,validateCatalogRelease,catalogCountLabel,normalizeCatalogItem,safeImageURL,safePublicURL} from '../public/catalog-client.js';

const taxonomy={groups:['genre','setting','relationship'].map(id=>({id,tags:[]}))};
const work=id=>({id,title:`작품 ${id}`,type:'웹툰',adult:false});
const response=payload=>({ok:true,json:async()=>payload});
const page=(items,{offset=0,total=items.length,scanned=items.length,excluded=0,limit=500,nextOffset=null,...other}={})=>({items,taxonomy,meta:{source:'supabase',total,offset,limit,scanned,excluded,nextOffset,...other}});

test('loads all 10,170 works across 21 pages without a 1,000 or 2,500 cap',async()=>{
  const source=Array.from({length:10170},(_,index)=>work(index+1)),calls=[],progress=[];
  const loaded=await loadLiveCatalog({fetchImpl:async(url,options)=>{
    calls.push(url);assert.equal(options.cache,'no-store');
    const offset=Number(new URL(url,'https://chalpick.example').searchParams.get('offset'));
    const items=source.slice(offset,offset+500),next=offset+items.length;
    return response(page(items,{offset,total:source.length,nextOffset:next<source.length?next:null}));
  },onProgress:value=>progress.push(value)});
  assert.equal(calls.length,21);assert.equal(loaded.items.length,10170);
  assert.equal(loaded.items.at(-1).id,10170);
  assert.deepEqual(progress.at(-1),{loaded:10170,total:10170});
  assert.equal(loaded.meta.available,10170);
  assert.ok(calls.every(url=>url.startsWith('/api/catalog?offset=')));
});

test('keeps DB moment tags, reports adult and publication exclusions separately',async()=>{
  const loaded=await loadLiveCatalog({fetchImpl:async()=>response(page([
    {...work(1),contextTags:['spring','valentine','spring']},
    {...work(2),age:19,adult:false},
    {...work(3),adult:true},
    {...work(4),type:'애니메이션'}
  ],{total:5,scanned:5,excluded:1}))});
  assert.equal(loaded.items.length,3);
  assert.deepEqual(loaded.items[0].contextTags,['spring','valentine']);
  assert.equal(loaded.meta.adultExcluded,2);assert.equal(loaded.meta.excluded,2);assert.equal(loaded.meta.available,1);
  assert.equal(catalogCountLabel(loaded.meta),'DB 공개 대상 5편 · 탐색 1편 · 성인 제외 2편 · 기타 공개 제외 2편');
});

test('unknown age remains unknown and age 18 or higher is never treated as non-adult',()=>{
  assert.equal(normalizeCatalogItem({...work(1),adult:null,age:null}).adult,null);
  assert.equal(normalizeCatalogItem({...work(1),adult:undefined,age:null}).adult,null);
  assert.equal(normalizeCatalogItem({...work(1),adult:false,age:18}).adult,true);
  assert.equal(normalizeCatalogItem({...work(1),adult:false,age:15}).adult,false);
});

test('taxonomy counts are recomputed across every page rather than retained from page one',async()=>{
  const first=page([{...work(1),tagGroups:{genre:['판타지','판타지']}}],{total:3,nextOffset:1});
  first.taxonomy={groups:taxonomy.groups.map(group=>({...group,tags:group.id==='genre'?[{label:'판타지',count:1,countAll:1}]:[]}))};
  const second=page([{...work(2),tagGroups:{genre:['판타지']}},{...work(3),adult:true,tagGroups:{genre:['판타지']}}],{total:3,offset:1});
  let requests=0;
  const loaded=await loadLiveCatalog({fetchImpl:async()=>response(requests++?second:first)});
  const fantasy=loaded.taxonomy.groups.find(group=>group.id==='genre').tags[0];
  assert.equal(fantasy.count,2);assert.equal(fantasy.countAll,3);
});

test('empty live DB is legitimate and never replaced with static catalog',async()=>{
  const loaded=await loadLiveCatalog({fetchImpl:async()=>response(page([]))});
  assert.equal(loaded.items.length,0);assert.equal(loaded.meta.total,0);
});

test('rejects a partial first page instead of presenting a misleading total',async()=>{
  await assert.rejects(loadLiveCatalog({fetchImpl:async()=>response(page([work(1)],{total:10170}))}));
});

test('rejects changing DB counts and duplicate IDs between pages',async()=>{
  for(const second of [page([work(2)],{offset:1,total:3}),page([work(1)],{offset:1,total:2})]){
    let requests=0;
    await assert.rejects(loadLiveCatalog({fetchImpl:async()=>response(requests++?second:page([work(1)],{total:2,nextOffset:1}))}));
  }
});

test('rejects skipped or nonadvancing cursors and inconsistent scanned counts',async()=>{
  for(const broken of [page([work(1)],{total:2,nextOffset:0}),page([work(1)],{total:3,nextOffset:2}),page([work(1)],{total:2,scanned:2}),page([work(1)],{source:'static'})]){
    await assert.rejects(loadLiveCatalog({fetchImpl:async()=>response(broken)}));
  }
});

test('a failed later page rejects the complete load and never fetches static fallback',async()=>{
  const calls=[];
  await assert.rejects(loadLiveCatalog({fetchImpl:async url=>{calls.push(url);return calls.length===1?response(page([work(1)],{total:2,nextOffset:1})):{ok:false};}}));
  assert.deepEqual(calls,['/api/catalog?offset=0','/api/catalog?offset=1']);
});

test('safe images allow the fixed adult placeholder, never arbitrary SVG data or unsafe links',()=>{
  assert.equal(safeImageURL('/assets/adult-placeholder.svg'),'/assets/adult-placeholder.svg');
  assert.equal(safeImageURL('https://example.com/poster.jpg'),'https://example.com/poster.jpg');
  for(const value of ['data:image/svg+xml,<svg onload="alert(1)"/>','data:image/png;base64,abc','javascript:alert(1)','/untrusted.svg','//other.example/image.jpg','https://user:password@example.com/image.jpg'])assert.equal(safeImageURL(value),'');
  assert.equal(safePublicURL('/assets/adult-placeholder.svg'),'');
  assert.equal(normalizeCatalogItem({...work(1),platforms:[{name:'플랫폼',url:'javascript:alert(1)'}]}).platforms[0].url,'');
});

test('app fetches DB catalog and does not merge obsolete static catalog or moment files',async()=>{
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('loadFastCatalog('));
  assert.equal(app.includes('loadLiveCatalog('),false);
  for(const stalePath of ['/data/catalog.json','/data/taxonomy.json','/data/context-tags.json'])assert.equal(app.includes(stalePath),false);
  assert.ok(app.includes('catalogCountLabel(catalogMeta)'));
});

function snapshotFixture(items=[work(1)]){
  const generatedAt='2026-10-23T06:00:00.000Z',adultExcluded=items.filter(item=>item.adult===true).length;
  const meta={source:'supabase',total:items.length,loaded:items.length,excluded:0,adultExcluded,available:items.length-adultExcluded,generatedAt};
  const release={...meta,schemaVersion:1,hash:'a'.repeat(64),catalogUrl:`/data/live-catalog.${'a'.repeat(16)}.json`};
  return {release,payload:{items,taxonomy,meta}};
}

test('fast startup loads all 10,170 works in one immutable CDN request',async()=>{
  const {release,payload}=snapshotFixture(Array.from({length:10170},(_,index)=>work(index+1))),calls=[];
  const catalog=await loadFastCatalog({release,fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.cache,'default');return response(payload);}});
  assert.deepEqual(calls,[release.catalogUrl]);assert.equal(catalog.items.length,10170);assert.equal(catalog.meta.delivery,'cdn-snapshot');
});

test('manifest discovery revalidates before fetching the one referenced catalog',async()=>{
  const {release,payload}=snapshotFixture(),calls=[];
  await loadFastCatalog({fetchImpl:async(url,options)=>{calls.push([url,options.cache]);return response(url.endsWith('catalog-release.json')?release:payload);}});
  assert.deepEqual(calls,[['/data/catalog-release.json','no-cache'],[release.catalogUrl,'default']]);
});

test('fast catalog rejects duplicates, stale deployment metadata and incomplete counts',async()=>{
  for(const mutate of [data=>data.items.push(work(1)),data=>data.meta.generatedAt='2025-01-01T00:00:00.000Z',data=>data.meta.total++,data=>data.items.splice(0,1)]){
    const {release,payload}=snapshotFixture();mutate(payload);
    await assert.rejects(loadFastCatalog({release,fetchImpl:async()=>response(payload)}));
  }
  const {release,payload}=snapshotFixture([work(1),work(1)]);
  await assert.rejects(loadFastCatalog({release,fetchImpl:async()=>response(payload)}));
});

test('fast release cannot fetch foreign origins, nonhashed files or impossible counters',()=>{
  const {release}=snapshotFixture();
  for(const invalidRelease of [{...release,catalogUrl:'https://other.example/data.json'},{...release,catalogUrl:'/data/catalog.json'},{...release,hash:'broken'},{...release,available:9},{...release,source:'static'}])assert.throws(()=>validateCatalogRelease(invalidRelease));
});

test('fast catalog preserves adult exclusions and rejects exposed adult covers',async()=>{
  const {release,payload}=snapshotFixture([{...work(1),adult:true,image:'/assets/adult-placeholder.svg'},work(2)]);
  const catalog=await loadFastCatalog({release,fetchImpl:async()=>response(payload)});assert.equal(catalog.meta.available,1);
  payload.items[0].image='https://example.com/adult.jpg';
  await assert.rejects(loadFastCatalog({release,fetchImpl:async()=>response(payload)}));
});

test('CDN failure never hides behind an obsolete or partial catalog fallback',async()=>{
  const {release}=snapshotFixture(),calls=[];
  await assert.rejects(loadFastCatalog({release,fetchImpl:async url=>{calls.push(url);return {ok:false};}}));
  assert.deepEqual(calls,[release.catalogUrl]);
});

test('only content-hashed local WebP covers are accepted',()=>{
  assert.equal(safeImageURL('/assets/covers/0123456789abcdef.webp'),'/assets/covers/0123456789abcdef.webp');
  for(const url of ['/assets/covers/poster.svg','/assets/covers/../private.webp','/assets/covers/a.webp'])assert.equal(safeImageURL(url),'');
});
