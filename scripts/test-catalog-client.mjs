import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadLiveCatalog,catalogCountLabel,normalizeCatalogItem,safeImageURL,safePublicURL} from '../public/catalog-client.js';

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
  assert.ok(app.includes('loadLiveCatalog('));
  for(const stalePath of ['/data/catalog.json','/data/taxonomy.json','/data/context-tags.json'])assert.equal(app.includes(stalePath),false);
  assert.ok(app.includes('catalogCountLabel(catalogMeta)'));
});
