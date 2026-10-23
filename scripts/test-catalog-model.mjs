import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog,ADULT_PLACEHOLDER} from '../server/catalog-model.mjs';

const work = (id,extra = {}) => ({id,title:`작품 ${id}`,media:'웹툰',release_year:2026,synopsis:'작품 소개',thumbnail_url:'https://images.example.com/cover.jpg',tier:1,tempo:0,mood:40,resolve:70,unusual:60,overall_complexity:2,tracking_complexity:3,tag_slugs_cache:['fantasy'],recommendation_status:'LIMITED',...extra});
const tables = (contents = [work(1)],extra = {}) => ({contents,persons:[],content_creators:[],content_platforms:[],content_complexity:[],tag_dictionary:[{tag_slug:'fantasy',display_name:'판타지',category:'genre',aliases:'환상; 판타지물',definition:'판타지의 정의',review_note:'비공개 검토 내용'},{tag_slug:'school',display_name:'학교',category:'setting_premise'},{tag_slug:'family',display_name:'가족',category:'character_relationship'}],story_engine_dictionary:[{engine_slug:'fantasy_growth',display_name:'판타지 성장',definition:'성장 이야기',review_note:'비공개 엔진 검토'}],...extra});

test('projects native and legacy JSON arrays, all works, and dynamically counted taxonomy', () => {
  const source = tables([work(1,{tag_slugs_cache:'["fantasy","fantasy","school"]'}),work(2,{media:'OTT',tag_slugs_cache:['fantasy','family']}),work(3,{media:'애니메이션'})]);
  const result = buildCatalog(source,{fetchedAt:'2026-10-23T03:00:00Z'});
  assert.equal(result.sourceCount,3);
  assert.equal(result.items.length,2);
  assert.equal(result.items[0].recommendation.status,'LIMITED');
  assert.equal(result.items[0].recommendation.axes.tempo,0);
  assert.deepEqual(result.items[0].tagGroups,{genre:['판타지'],setting:['학교'],relationship:[]});
  assert.equal(result.taxonomy.groups[0].tags[0].count,2);
  assert.equal(result.taxonomy.groups[0].tags[0].countAll,2);
  assert.equal(result.counts.excludedUnsupportedMedia,1);
  assert.equal(result.updatedAt,'2026-10-23T03:00:00Z');
  assert.equal(JSON.stringify(result).includes('비공개'),false);
});

test('retains uncertain age, binds supplied ratings, and suppresses every known-adult original image', () => {
  const source = tables([work(1),work(2),work(3,{thumbnail_url:'data:image/png;base64,ADULT_IMAGE',origin_image_url:'https://images.example.com/original-adult.jpg'}),work(4,{title:'작품 [19세 완전판]'}),work(5)]);
  const result = buildCatalog(source,{ageRatings:{1:{adult:false,age:15},2:{adult:true,age:19},5:{adult:false,age:0,title:'다른 작품'}}});
  assert.deepEqual(result.items.map(item => item.adult),[false,true,true,true,null]);
  assert.deepEqual(result.items.slice(1,4).map(item => item.image),[ADULT_PLACEHOLDER,ADULT_PLACEHOLDER,ADULT_PLACEHOLDER]);
  assert.equal(result.items[4].age,null);
  assert.equal(result.taxonomy.groups[0].tags[0].count,2);
  assert.equal(result.taxonomy.groups[0].tags[0].countAll,5);
  assert.equal(JSON.stringify(result).includes('original-adult'),false);
  assert.equal(JSON.stringify(result).includes('ADULT_IMAGE'),false);
  assert.equal(buildCatalog(tables()).items[0].adult,null);
});

test('keeps creator identities scoped and collective accounts unlinked', () => {
  const source = tables(undefined,{
    persons:[{id:1,name:'작가',normalized_name:'작가',external_person_id:'naver_artist_1'},{id:2,name:'작가',normalized_name:'작가'},{id:3,name:'공동계정',external_person_id:'naver_artist_305532'}],
    content_creators:[{id:3,content_id:1,person_id:3,creator_role:'LEAD_ARTIST',credit_order:2},{id:2,content_id:1,person_id:2,creator_role:'DIRECTOR',credit_order:1},{id:1,content_id:1,person_id:1,creator_role:'STORY_WRITER',credit_order:1,source_url:'https://example.com/source\nhttps://example.com/second',character_name:'비공개 배역'}]
  });
  const item = buildCatalog(source).items[0];
  assert.deepEqual(item.creators,['작가','공동계정']);
  assert.equal(item.credits[0].identityConfidence,'verified_external_id');
  assert.equal(item.credits[0].sourceUrl,'https://example.com/source');
  assert.equal(item.credits[1].identityConfidence,'collective_account');
  assert.equal(item.credits[1].identityKey,null);
  assert.equal(item.credits[1].candidateKey,null);
  assert.equal(item.credits[2].identityConfidence,'content_scoped');
  assert.equal(item.credits[2].identityKey,null);
  assert.equal(JSON.stringify(item).includes('비공개'),false);
});

test('accepts both partial status spellings, deduplicates platforms, and rejects unavailable or unsafe links', () => {
  const platform = (id,name,extra = {}) => ({id,content_id:1,platform:name,watch_url:`https://example.com/${id}`,is_available:true,verification_status:'partially_verified',platform_role:'availability',...extra});
  const source = tables(undefined,{content_platforms:[platform(1,'카카오'),platform(2,'카카오',{verification_status:'verified'}),platform(3,'네이버',{verification_status:'partial'}),platform(4,'삭제',{is_available:false}),platform(5,'미확인',{verification_status:'pending'}),platform(6,'위험',{watch_url:'javascript:alert(1)'}),platform(7,'암호',{watch_url:'https://user:password@example.com/x'}),platform(8,'개행',{watch_url:'https://example.com/\nprivate'}),platform(9,'Origin',{is_available:null,platform_role:'origin',verification_status:'verified'})]});
  const links = buildCatalog(source).items[0].platforms;
  assert.deepEqual(links.map(link => link.name),['카카오','네이버','Origin']);
  assert.equal(links[0].url,'https://example.com/2');
  assert.ok(links.every(link => Object.keys(link).join(',') === 'name,url'));
});

test('maps multi-valued Korean moment labels without guessing sunny or cloudy weather', () => {
  const source = tables([work(1,{anniversary_tags:['삼일절','크리스마스','발렌타인데이','화이트데이','스승의 날','식목일','할로윈','__proto__','constructor'],season_tags:'["겨울","봄","겨울"]',weather_tags:['눈','비/폭풍','맑음','흐림']})]);
  assert.deepEqual(buildCatalog(source).items[0].contextTags,['independence-march','christmas','valentine','white-day','teachers','arbor','halloween','winter','spring','snow','rain']);
});

test('preserves structured complexity before main-row fallback and never converts missing values to zero', () => {
  const source = tables(undefined,{content_complexity:[{content_id:1,overall_complexity:4,tracking_complexity:null,character_complexity:3,analysis_state:'PROVISIONAL',analysis_note:'비공개 분석',analysis_sources:'https://internal.example'}]});
  const recommendation = buildCatalog(source).items[0].recommendation;
  assert.deepEqual(recommendation.complexity,{overall:4,tracking:3,character:3,faction:null,naming:null,relationship:null,lore:null});
  assert.equal(recommendation.provisional,true);
  assert.equal(recommendation.analysisState,'PROVISIONAL');
  assert.equal(JSON.stringify(recommendation).includes('비공개'),false);
  assert.equal(JSON.stringify(recommendation).includes('internal.example'),false);
  assert.equal(buildCatalog(tables([work(2,{tempo:'',tier:null})])).items[0].recommendation.axes.tempo,null);
});

test('does not expose unknown columns or inherited private fields and rejects invalid identifiers', () => {
  const source = tables([work(1,{secret_key:'SECRET',source_url:'PRIVATE',research_note:'INTERNAL',thumbnail_url:'javascript:alert(1)',origin_image_url:'https://safe.example/cover'})]);
  const result = buildCatalog(source);
  assert.equal(result.items[0].image,'https://safe.example/cover');
  assert.equal(/SECRET|PRIVATE|INTERNAL/u.test(JSON.stringify(result)),false);
  assert.throws(() => buildCatalog(tables([work(1),work(1)])),/duplicate/);
  assert.throws(() => buildCatalog(tables([work('x')])),/invalid/);
  assert.throws(() => buildCatalog({}),/required/);
  assert.throws(() => buildCatalog({...source,persons:{id:1}}),/Invalid catalog table/);
});

test('does not impose a stale 2500-work cap on a 10170-work database result', () => {
  const source = tables(Array.from({length:10170},(_,index) => work(index + 1)));
  const result = buildCatalog(source);
  assert.equal(result.items.length,10170);
  assert.equal(result.taxonomy.groups[0].tags[0].count,10170);
  assert.equal(result.counts.ageUnconfirmed,10170);
});
