import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prerenderHome,serializeBootstrap} from './prerender-home.mjs';

const template=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const generatedAt='2026-10-23T06:00:00.000Z';
const work=id=>({id,title:`검증 작품 ${id}`,type:id%2?'웹툰':'웹소설',adult:false,age:null,image:`https://images.example.com/${id}.jpg`,description:'검증된 줄거리',genre:'판타지',creators:['작가'],tags:['판타지','액션','회귀'],contextTags:['autumn'],platforms:[{name:'네이버웹툰',url:'https://comic.naver.com/'}],credits:[],tagGroups:{genre:['판타지','액션'],setting:['회귀'],relationship:[]}});
const createCatalog=(count=101)=>{
  const items=Array.from({length:count},(_,index)=>work(index+1));
  items[count-1]={...items[count-1],adult:true,age:19,title:'성인 전용 숨김 작품'};
  return {items,taxonomy:{groups:[{id:'genre',tags:[{label:'판타지',count:0},{label:'액션',count:0}]},{id:'setting',tags:[{label:'회귀',count:0}]},{id:'relationship',tags:[]}]},meta:{source:'supabase',total:count,loaded:count,available:count-1,adultExcluded:1,excluded:0,fetchedAt:generatedAt}};
};
const release={schemaVersion:1,source:'supabase',generatedAt,catalogUrl:'/data/live-catalog.1234567890abcdef.json',hash:'1234567890abcdef',total:101,available:100,adultExcluded:1};
const getBootstrap=html=>JSON.parse(html.match(/<script type="application\/json" id="catalog-bootstrap">([\s\S]*?)<\/script>/)[1]);
const region=(html,name)=>html.split(`<!-- prerender:${name}:start -->`)[1].split(`<!-- prerender:${name}:end -->`)[0];

test('first HTML contains real works and full-catalog counts before JavaScript',async()=>{
  const html=await prerenderHome({html:template,catalog:createCatalog(),release});
  assert.equal((region(html,'hero').match(/class="hero-card /g)||[]).length,3);
  assert.equal((region(html,'curated').match(/class="work-card"/g)||[]).length,6);
  assert.equal((region(html,'browse').match(/class="work-card"/g)||[]).length,12);
  assert.match(region(html,'count'),/<strong>100<\/strong>/);
  assert.match(region(html,'facets'),/data-value="판타지" data-count="100"/);
  assert.match(region(html,'platforms'),/data-value="네이버웹툰" data-count="100"/);
  assert.match(html,/<body data-catalog-prerendered="true">/);
  assert.doesNotMatch(html,/class="hero-loading"|cdn\.jsdelivr\.net/);
  assert.match(region(html,'preload'),/fetchpriority="high"/);
  assert.match(region(html,'hero'),/width="360" height="480" loading="eager"/);
  const bootstrap=getBootstrap(html);
  assert.ok(bootstrap.items.length<=40);
  assert.equal(bootstrap.meta.available,100);
  assert.equal(bootstrap.taxonomy.groups[0].tags[0].count,100);
  assert.deepEqual(bootstrap.release,release);
  assert.match(region(html,'date'),/2026.*10.*23/);
});

test('adult works cannot appear in cards, bootstrap, context, or popular titles',async()=>{
  const catalog=createCatalog();
  const popular={lists:[{id:'comic',media:'웹툰',status:'available',sourceLabel:'공식 순위',sourceUrl:'https://comic.naver.com/',observedAt:generatedAt,entries:[{rank:1,catalogId:101,title:'성인 전용 숨김 작품'},{rank:2,catalogId:1,title:'검증 작품 1'},{rank:3,catalogId:null,title:'판본 미확인 작품'}]}]};
  const html=await prerenderHome({html:template,catalog,popular,release});
  assert.doesNotMatch(html,/성인 전용 숨김 작품|판본 미확인 작품/);
  assert.match(region(html,'popular'),/class="side-rank">2<\/span>/);
  assert.deepEqual(getBootstrap(html).popular.lists[0].entries.map(entry=>entry.rank),[2]);
});

test('full verified metadata is required and duplicate IDs or markers fail the build',async()=>{
  const catalog=createCatalog();
  await assert.rejects(prerenderHome({html:template,catalog:{...catalog,items:catalog.items.slice(0,40)}}),/complete verified/);
  await assert.rejects(prerenderHome({html:template,catalog:{...catalog,meta:{...catalog.meta,available:99}}}),/public count mismatch/);
  await assert.rejects(prerenderHome({html:template,catalog:{...catalog,meta:{...catalog.meta,fetchedAt:null}}}),/timestamp/);
  await assert.rejects(prerenderHome({html:template.replace('<!-- prerender:hero:start -->',''),catalog}),/marker: hero/);
  await assert.rejects(prerenderHome({html:template+'<!-- prerender:hero:start -->',catalog}),/marker: hero/);
  const duplicate=createCatalog();duplicate.items[1]=duplicate.items[0];
  await assert.rejects(prerenderHome({html:template,catalog:duplicate}),/Duplicate/);
  const invalid=createCatalog();invalid.items[0].id='1" onclick="alert(1)';
  await assert.rejects(prerenderHome({html:template,catalog:invalid}),/identity/);
});

test('embedded data cannot terminate its JSON script or create unescaped HTML',async()=>{
  const catalog=createCatalog();
  const malicious='</script><script>alert("x")</script>&\u2028\u2029';
  catalog.items[0]={...catalog.items[0],title:malicious,description:malicious};
  const html=await prerenderHome({html:template,catalog,release});
  assert.doesNotMatch(html,/<script>alert|<\/script><script>/);
  assert.match(region(html,'hero'),/&lt;\/script&gt;/);
  assert.equal(getBootstrap(html).items.find(item=>item.id===1).title,malicious);
  assert.doesNotMatch(serializeBootstrap({malicious}),/[<>&\u2028\u2029]/);
});

test('only verified matching cover manifests replace public images',async()=>{
  const publicPath=await mkdtemp(path.join(os.tmpdir(),'chalpick-prerender-'));
  try{
    await mkdir(path.join(publicPath,'assets/covers'),{recursive:true});
    const entries=[{id:1,source:'https://images.example.com/1.jpg',url:'/assets/covers/1234567890abcdef.webp'},{id:2,source:'https://images.example.com/old.jpg',url:'/assets/covers/2234567890abcdef.webp'},{id:3,source:'https://images.example.com/3.jpg',url:'javascript:alert(1)'},{id:101,source:'https://images.example.com/101.jpg',url:'/assets/covers/3234567890abcdef.webp'}];
    await writeFile(path.join(publicPath,'assets/covers/manifest.json'),JSON.stringify(entries));
    const html=await prerenderHome({html:template,catalog:createCatalog(),publicPath,release});
    const bootstrap=getBootstrap(html);
    assert.deepEqual(bootstrap.coverImages,[entries[0]]);
    assert.equal(bootstrap.items.find(item=>item.id===1).image,entries[0].url);
    assert.equal(bootstrap.items.find(item=>item.id===2).image,'https://images.example.com/2.jpg');
    assert.match(region(html,'preload'),/assets\/covers\/1234567890abcdef\.webp/);
    assert.doesNotMatch(html,/javascript:|2234567890abcdef|3234567890abcdef/);
  }finally{await rm(publicPath,{recursive:true,force:true});}
});

test('seasonal recommendations and hidden platform counts use the full public catalog',async()=>{
  const catalog=createCatalog();
  catalog.items[0].platforms.push({name:'문피아',url:'https://www.munpia.com/'});
  const html=await prerenderHome({html:template,catalog,release});
  assert.match(region(html,'context'),/data-theme="autumn"/);
  assert.match(region(html,'context'),/100편, 내 취향으로 만나보기/);
  assert.doesNotMatch(region(html,'platforms'),/문피아/);
  assert.match(region(html,'context'),/자료 생성 시점의 계절 추천/);
});

test('both former ad slots carry lazy loaded Chalpick promotions',()=>{
  assert.match(template,/class="advertisement ad-wide promo-banner" data-action="profile"/);
  assert.match(template,/class="advertisement ad-square promo-banner" data-action="profile"/);
  assert.match(template,/src="\/assets\/promo-wide\.webp"[^>]*loading="lazy"/);
  assert.match(template,/src="\/assets\/promo-sidebar\.webp"[^>]*loading="lazy"/);
  assert.doesNotMatch(template,/여기가 광고하는 자리입니다|class="ad-label"/);
});
