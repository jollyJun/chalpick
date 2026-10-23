'use strict';
const WORKS = window.CHALPICK_WORKS || [];
const TYPES = window.CHALPICK_TYPES || [];
if (!WORKS.length || !TYPES.length) { console.error('Chalpick data failed to load.'); }

const GENERIC_TAGS = new Set(['판타지','액션','현대','드라마','로맨스','코미디','청춘','시대극','휴먼','로코','스릴러','미스터리','SF','무협','무림','성장물']);
const SEARCH_ALIASES={'호러물':['호러','공포'],'공포물':['공포','호러'],'무협물':['무협','무림'],'괴수물':['괴수','몬스터'],'좀비물':['좀비'],'로맨스물':['로맨스'],'판타지물':['판타지'],'액션물':['액션']};
function semanticGroup(w){return w.enginePrimary||null;}

const MEDIA = ['전체','영화','드라마','웹툰','웹소설'];
const PRIORITIES=[['new','최근 나온 작품부터 보기']];
const FEEDBACK = [
  ['want','보고 싶어요'],['liked','재미있었어요'],['meh','아쉬웠어요'],
  ['no','관심 없어요'],['stopped','중간에 멈췄어요'],['forgot','기억이 잘 안 나요']
];
const STOP_REASONS = [['bored','재미가 없어졌어요'],['busy','시간이 없었어요'],['later','나중에 이어볼래요'],['skip','이유는 넘어갈게요']];
const MODE_INFO = {
  match:['찰떡픽','좋아한 여러 작품의 공통 분위기와 흐름을 종합해서 추천해요.'],
  similar:['유사픽','내가 지정한 한 작품을 기준으로 비슷한 작품을 골라줘요.'],
  discover:['발견픽','익숙한 취향의 연결고리는 유지하되, 배경·형식·소재를 조금 넓혀서 추천해요.']
};
const $ = id => document.getElementById(id);
const BY_ID = Object.assign(Object.create(null),Object.fromEntries(WORKS.map(w => [w.id,w])));
const STORE = 'chalpick-taste-20261015-v16';
const V14_STORE='chalpick-taste-20261013-v14';
const PREVIOUS_STORE = 'chalpick-taste-20261014-v15';
const LEGACY_STORE = 'chalpick-taste-20261012-v12';
const ENGINE = window.ChalpickEngine.create(WORKS,{nowYear:new Date().getFullYear(),meta:window.CHALPICK_META});
const CATALOG = window.ChalpickCatalog.create(WORKS,window.CHALPICK_META,ENGINE);
let composing = false;
let noticeTimer = null;
let currentStage = '';
let historyReplaying=false;
let sharedIndex=null;
const PREFERENCES=window.CHALPICK_PREFERENCE_OPTIONS.create(WORKS,{meta:window.CHALPICK_META,engine:ENGINE});
let optionExpanded={liked:false,avoided:false};
let optionSuggestions=null;
let genresExpanded=false;
let REC = {match:[], similar:[], discover:[]};

function fresh(){
 return {version:16,cardAnswers:{},preferenceNone:{liked:false,avoided:false},optionsConfirmed:false,likedTags:[],avoidedTags:[],selected:[],disliked:[],display:[],shown:{},shownIP:{},last:[],mediaFilters:[],genreFilters:[],browseMode:'balanced',query:'',all:false,expanded:false,exclude:[],priority:[],traits:[],preferredMedia:[],feedback:{},stage:'select',type:null,mode:'match',pivot:null,openFeedback:null,stopPending:null,seed:Math.random(),round:0,batchNotice:'',recommendSeen:{match:[],similar:[],discover:[]}};
}
let state = fresh();
const listOf=(value,accept=()=>true)=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&accept(x)):[];
const recordOf=(value,accept)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([k,v])=>accept(k,v))):{};
let rawSaved=null;
try{rawSaved=JSON.parse(localStorage.getItem(STORE)||localStorage.getItem(PREVIOUS_STORE)||localStorage.getItem(V14_STORE)||localStorage.getItem(LEGACY_STORE)||'null');}catch(e){}
if(rawSaved&&[12,13,14,15,16].includes(rawSaved.version)&&Array.isArray(rawSaved.selected)){
 const v=rawSaved;state={...fresh(),
 cardAnswers:recordOf(v.cardAnswers,(k,n)=>['tempo','mood','resolve','unusual'].includes(k)&&(n===0||n===1)),
 preferenceNone:{liked:v.preferenceNone?.liked===true,avoided:v.preferenceNone?.avoided===true},optionsConfirmed:v.version===16&&v.optionsConfirmed===true,
 selected:listOf(v.selected,x=>!!BY_ID[x]).slice(0,10),disliked:listOf(v.disliked,x=>!!BY_ID[x]),
 display:listOf(v.display,x=>!!BY_ID[x]),last:listOf(v.last,x=>!!BY_ID[x]),
 shown:recordOf(v.shown,(k,n)=>!!BY_ID[k]&&Number.isFinite(n)&&n>=0),shownIP:recordOf(v.shownIP,(k,n)=>Number.isFinite(n)&&n>=0),
 mediaFilters:listOf(v.mediaFilters,x=>MEDIA.slice(1).includes(x)),preferredMedia:listOf(v.preferredMedia,x=>MEDIA.slice(1).includes(x)),
 genreFilters:listOf(v.genreFilters,x=>CATALOG.genres().some(g=>g.key===x)),browseMode:'balanced',
 likedTags:listOf(v.likedTags),avoidedTags:listOf(v.avoidedTags),traits:listOf(v.traits),exclude:listOf(v.exclude),priority:listOf(v.priority,x=>x==='new'),
 feedback:recordOf(v.feedback,(k,f)=>!!BY_ID[k]&&f&&typeof f==='object'&&FEEDBACK.some(x=>x[0]===f.status)),
 stage:['select','options','result'].includes(v.stage)?v.stage:'select',mode:['match','similar','discover'].includes(v.mode)?v.mode:'match',
 query:typeof v.query==='string'?v.query:'',expanded:v.expanded===true,all:v.all===true,
 pivot:typeof v.pivot==='string'&&BY_ID[v.pivot]?v.pivot:null,seed:Number.isFinite(v.seed)?v.seed:Math.random(),round:Number.isInteger(v.round)&&v.round>=0?v.round:0,
 batchNotice:typeof v.batchNotice==='string'?v.batchNotice:'',recommendSeen:Object.fromEntries(['match','similar','discover'].map(k=>[k,listOf(v.recommendSeen?.[k],id=>!!BY_ID[id])]))};
 state.disliked=state.disliked.filter(id=>!state.selected.includes(id));
}
function migratePreferences(){
 const map={unresolved:'axis:resolve-linger',horror:'tag:horror',gore:'tag:gore',medical:'tag:medical'};
 state.likedTags=[...new Set([...state.likedTags,...state.traits.map(x=>x==='payoff'?'axis:resolve-payoff':x==='overpowered'?'tag:overpowered':null).filter(Boolean)])];
 state.avoidedTags=[...new Set([...state.avoidedTags,...state.exclude.map(x=>map[x]).filter(Boolean)])].filter(x=>!state.likedTags.includes(x));
 state.priority=state.priority.filter(x=>x==='new');state.traits=[];state.exclude=[];state.version=16;
 if(rawSaved&&rawSaved.version!==16){state.recommendSeen={match:[],similar:[],discover:[]};state.display=[];state.last=[];state.shown={};state.shownIP={};state.round=0;state.batchNotice='추천 방식이 개선됐어요. 고른 작품과 태그는 유지했어요.';}
}
migratePreferences();

function save(){
  try {
    const {openFeedback, stopPending, ...rest} = state;
    localStorage.setItem(STORE, JSON.stringify(rest));
  } catch(e) {}
}
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function normalize(s){
  return String(s || '').toLowerCase().replace(/\s+/g,'').replace(/[.,·:'"!?()\[\]{}\-]/g,'');
}
function compactTitle(s){
  return String(s || '').toLowerCase().replace(/\s+/g,'').replace(/[.,·:'"!?()\[\]{}\-]/g,'');
}
function ipKey(input){return ENGINE.ipKey(typeof input==='string'?{title:input}:input);}

function toast(msg){
  const el = $('toast'); if(!el) return;
  clearTimeout(noticeTimer); el.textContent = msg; el.classList.add('on');
  noticeTimer = setTimeout(() => el.classList.remove('on'), 2500);
}
function pseudoRandom(work){
  const str = work.id + '-' + state.seed;
  let n = 0;
  for(const ch of str) n = (Math.imul(n,31) + ch.charCodeAt(0)) >>> 0;
  return n / 4294967296;
}
function chosen(){ return state.selected.map(id => BY_ID[id]).filter(Boolean); }
function feedbackEntries(){ return Object.entries(state.feedback).map(([id,v]) => [BY_ID[id], v]).filter(x => x[0]); }
function positiveExtra(){return feedbackEntries().filter(([,v])=>v.status==='liked').map(([w])=>w);}
function negativeExtra(){ const map=new Map(); (state.disliked||[]).map(id=>BY_ID[id]).filter(Boolean).forEach(w=>map.set(w.id,w)); feedbackEntries().filter(([,v]) => ['meh','no'].includes(v.status) || (v.status === 'stopped' && v.reason === 'bored')).map(([w]) => w).forEach(w=>map.set(w.id,w)); return [...map.values()]; }
function profileWorks(){ const map = new Map(); [...chosen(), ...positiveExtra()].forEach(w => map.set(w.id, w)); return [...map.values()]; }
function mediaFilterActive(w){ return !state.mediaFilters.length || state.mediaFilters.includes(w.media); }
function pool(){ return CATALOG.pool(state); }
function exposure(w){ return state.shown[w.id] || 0; }
function genre(w){ return (w.tags && w.tags[0]) || w.media; }
function diversity(w,existing){
 return 5/(1+existing.filter(x=>x.media===w.media).length)+6/(1+existing.filter(x=>x.enginePrimary===w.enginePrimary).length)+3/(1+existing.filter(x=>x.worldModel===w.worldModel).length)+pseudoRandom(w);
}
function selectDiverse(list, count, existing=[]){
  const candidates = [...list];
  const picked = [];
  const usedIP = new Set(existing.map(ipKey));
  while(picked.length < count && candidates.length){
    const eligible = candidates.filter(w => !usedIP.has(ipKey(w)));
    if(!eligible.length) break;
    eligible.sort((a,b) => diversity(b, [...existing, ...picked]) - diversity(a, [...existing, ...picked]));
    const next = eligible[0];
    picked.push(next);
    usedIP.add(ipKey(next));
    const idx = candidates.findIndex(x => x.id === next.id);
    if(idx >= 0) candidates.splice(idx,1);
  }
  return picked;
}
function scoreProfile(list){
 const p={};const unique=[...new Map(list.map(w=>[ipKey(w),w])).values()];
 for(const key of ['tempo','mood','resolve','unusual']){const available=unique.filter(w=>Number.isFinite(w[key]));p[key]=available.length?available.reduce((sum,w)=>sum+w[key],0)/available.length:null;}
 return p;
}

function sourceAffinity(a,b){return ENGINE.affinity(a,b);}

function officialUrl(w){
 const links=(w.sourceLinks||[]).filter(x=>x.type==='official_platform'&&x.status==='verified').flatMap(x=>x.urls||[]);
 return links.find(raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!/\/weekday(?:\b|\/)/.test(u.pathname)&&/^(?:[a-z0-9-]+\.)*(?:naver\.com|webtoons\.com|kakao\.com|kakaopage\.com|ridibooks\.com|munpia\.com|netflix\.com|tving\.com|wavve\.com|disneyplus\.com)$/.test(u.hostname);}catch(_){return false;}})||null;
}
function poster(w, small=false){
 const palettes={영화:['#ede9fb','#665592'],드라마:['#e8effa','#466b99'],웹툰:['#e6f2ed','#40765f'],웹소설:['#f6ede5','#906c4d']};
 const [bg,ink]=palettes[w.media]||['#eeedf4','#655c81'];
 const authors=(w.creators||[]).filter(c=>c.status==='verified'&&['original_author','story_writer','screenwriter'].includes(c.role)).map(c=>c.name);
 const tags=(w.tagSlugs||[]).filter(t=>!GENERIC_TAGS.has(window.CHALPICK_META?.tagDictionary?.[t]?.label)&&!['action','fantasy','comedy','romance','murim','coming-of-age','modern','secondary-world'].includes(t)).slice(0,2).map(t=>window.CHALPICK_META?.tagDictionary?.[t]?.label||t);
 const detail=authors.length?[...new Set(authors)].slice(0,2).join(' · '):tags.join(' · ')||w.yearLabel||'작품 정보';
 if(small)return `<div class="rec-poster info-cover" style="--tile-bg:${bg};--tile-ink:${ink}"><span>${esc(w.media)}</span><small>${esc(w.yearLabel||'')}</small></div>`;
 return `<div class="cover info-cover" style="--tile-bg:${bg};--tile-ink:${ink}"><span class="source">${esc(w.media)}${w.platforms?.[0]?' · '+esc(w.platforms[0]):''}</span><span class="cover-facts">${esc(detail)}</span></div>`;
}
function makeBatch(initial=false){
 const result=CATALOG.batch(state,{size:18,reset:false});
 state.display=result.ids;
 for(const key of ['shown','shownIP','last','round'])if(result[key]!==undefined)state[key]=result[key];
 state.batchNotice=result.notice||'';state.all=false;state.query='';save();
}
function genreTabs(){
 const selected=new Set(state.genreFilters);
 const priority=['murim','fantasy','action','romance','romcom','thriller','mystery','slice-of-life'];
 const all=CATALOG.genres(),visible=genresExpanded?all:all.filter(g=>priority.includes(g.key)||selected.has(g.key));
 visible.sort((a,b)=>{const pa=priority.indexOf(a.key),pb=priority.indexOf(b.key);return (pa<0?99:pa)-(pb<0?99:pb);});
 $('genre-tabs').innerHTML=[{key:'all',label:'모든 장르'},...visible].map(g=>{
  const on=g.key==='all'?!selected.size:selected.has(g.key);
  return `<button type="button" class="genre-tab ${on?'active':''}" data-genre="${esc(g.key)}" aria-pressed="${on}">${esc(g.label)}</button>`;
 }).join('')+`<button type="button" class="genre-tab" data-genre-more="true">${genresExpanded?'장르 접기':'장르 더 보기'}</button>`;
 document.querySelectorAll('[data-browse-mode]').forEach(b=>{const on=b.dataset.browseMode===state.browseMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
function mediaTabs(){
  const active = new Set(state.mediaFilters || []);
  $('media-tabs').innerHTML = MEDIA.map(m => {
    const on = m === '전체' ? active.size === 0 : active.has(m);
    return `<button class="media-tab ${on ? 'active' : ''}" data-medium="${m}" type="button" aria-pressed="${on}">${m}</button>`;
  }).join('');
}
function resultListing(){
  if(state.query)return CATALOG.search(state.query,pool(),240);
  const all = pool();
  if(state.all) return all;
  return state.display.map(id => BY_ID[id]).filter(w=>w&&pool().includes(w));
}
function listHeading(list){
 if(state.query)return `검색 결과 ${list.length}편`;
 const labels=CATALOG.genres().filter(g=>state.genreFilters.includes(g.key)).map(g=>g.label);
 const filters=[...state.mediaFilters,...labels];
 if(filters.length)return `${filters.join(' · ')} 작품 · ${pool().length}편 중 ${list.length}편`;
 if(state.browseMode==='explore')return '새로운 분야의 작품';
 if(state.browseMode==='related'&&state.selected.length)return '고른 작품과 같은 분야의 작품';
 return state.selected.length>=3?'관련 작품과 새로운 분야':'여러 분야의 작품';
}
function cardMarkup(w){
  const active = state.selected.includes(w.id);
  const disliked = (state.disliked || []).includes(w.id);
  const disabled = state.selected.length >= 10 && !active && !chosen().some(x=>ENGINE.isSameIP(x,w));
  return `<article class="item ${active ? 'selected' : ''} ${disliked ? 'disliked' : ''}"><button class="card-pick" type="button" data-pick="${w.id}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}>${poster(w)}<span class="tick">${active ? '✓' : '+'}</span><div class="info"><b>${esc(w.title)}</b><div class="meta"><strong>${esc(w.media)}</strong><span>${w.yearLabel || '연도 미확인'}</span><span>${esc((w.tags || []).slice(0,2).join(' · '))}</span>${w.creator?`<span>${esc(w.creator)}</span>`:''}</div></div></button><button class="card-negative" type="button" data-dislike="${w.id}" aria-pressed="${disliked}">${disliked ? '× 별로예요 취소' : '× 별로예요'}</button></article>`;
}
function renderPickedSummary(){
  const n = state.selected.length;
  $('count').textContent = `${n} / 10`;
  $('progress-bar').style.width = `${Math.min(100,n/10*100)}%`;
  $('progress-caption').textContent = n === 0 ? '5편 이상 고른 뒤, 선호·제외를 확인해 주세요.' : n < 5 ? `${5-n}편 더 선택하면 다음 단계로 갈 수 있어요.` : n === 10 ? '10편을 골랐어요. 다음은 선호·제외 확인이에요.' : '다음 단계로 가거나, 최대 10편까지 더 골라도 좋아요.';
  $('go-options').disabled = n < 5;
  $('go-options').textContent=n<5?`${5-n}편 더 선택해 주세요`:n<10?`${n}편으로 다음 단계 →`:'10편 선택 완료 · 다음 단계 →';
  $('count').textContent=`${n}편 선택`;
  $('selection-ready').textContent=n<10?'5편으로도 시작할 수 있어요. 10편을 고르면 취향을 더 세밀하게 알아볼 수 있어요.':'10편을 모두 골랐어요. 이제 좋아하는 요소와 피하고 싶은 내용을 확인해요.';
  $('expand-picks').classList.toggle('hidden', n <= 2);
  $('expand-picks').textContent = state.expanded ? '접기' : `전체 ${n}개 보기`;
  const show = state.expanded ? chosen() : chosen().slice(-2);
  $('picked-pills').innerHTML = show.length ? show.map(w => `<span class="picked-pill"><span>${esc(w.title)}</span><button type="button" data-remove="${w.id}" aria-label="${esc(w.title)} 선택 취소">×</button></span>`).join('') : '<span class="sub">선택한 작품이 아직 없습니다.</span>';
  $('sidebar-list').innerHTML = n ? chosen().map((w,i) => `<div class="line"><span>${i+1}. ${esc(w.title)}</span><button type="button" data-remove="${w.id}" aria-label="선택 취소">×</button></div>`).join('') : '<div class="empty">아직 선택한 작품이 없어요.</div>';
  const dislikedWorks=(state.disliked||[]).map(id=>BY_ID[id]).filter(Boolean);
  const box=$('disliked-summary');
  if(box){
    box.classList.toggle('hidden', dislikedWorks.length===0);
    box.innerHTML=dislikedWorks.length?`<strong>별로예요 ${dislikedWorks.length}편</strong> · ${dislikedWorks.slice(0,4).map(w=>`<button type="button" data-undislike="${w.id}">${esc(w.title)}</button>`).join(' · ')}${dislikedWorks.length>4?' 외 '+(dislikedWorks.length-4)+'편':''}`:'';
  }
}
function showStage(name, scroll=true){
  ['select','options','result','share','browse'].forEach(x => { const el = $('step-' + x); if(el) el.classList.toggle('hidden', name !== x); });
  if($('stages')) $('stages').classList.toggle('hidden', name === 'share' || name === 'browse');
  const titles = {
    select:['찰픽 취향테스트','좋아했던 작품 5편,<br>다음 취향을 찾아볼까요?','좋아하는 작품만 골라주세요. 모르는 작품은 넘기고, 제목이나 장르로 바로 찾아도 좋아요.'],
    options:['2단계 · 선호와 제외','어떤 점이 좋고, 어떤 점은 피하고 싶나요?','두 항목 모두 답해 주세요. 맞는 태그가 없으면 ‘특별히 없음’을 고르면 돼요.'],
    result:['나의 취향 결과','내 취향은 이런 이야기!','좋아했던 작품과 이어지는 다음 작품을 찾아봤어요.'],
    share:['친구의 취향 카드','친구의 취향 카드예요.<br>당신은 어떤 이야기가 좋나요?','아래 카드를 누르면 크게 볼 수 있어요. 당신의 취향도 찾아보세요.'],
    browse:['EXPLORE ANIMALS','대표 카드 보기','대표 카드는 취향을 요약한 이미지예요.']
  };
  if($('hero-kicker')) $('hero-kicker').textContent = titles[name][0];
  if($('hero-title')) $('hero-title').innerHTML = titles[name][1];
  if($('hero-desc')) $('hero-desc').textContent = titles[name][2];
  document.querySelectorAll('.stage b').forEach((b,i) => b.classList.toggle('active', i === (name === 'select' ? 0 : name === 'options' ? 1 : 2)));
  if(scroll && currentStage !== name) window.scrollTo({top:0, behavior:'instant'});
  if(!historyReplaying&&name!=='share'&&!readShare()&&currentStage!==name){if(!currentStage)history.replaceState({chalpickStage:name},'',location.href);else history.pushState({chalpickStage:name},'',location.href);}
  currentStage = name;
}
function renderSelection(preserve=false){
 state.stage='select';
  showStage('select', !preserve);
  renderPickedSummary();
  mediaTabs();genreTabs();
  $('catalog-total').textContent=`전체 ${WORKS.length.toLocaleString('ko-KR')}편`;
  $('batch-guide').textContent=state.browseMode==='related'?'고른 작품과 같은 장르·소재를 더 찾아요. 결과 추천과는 별도로 작품 선택을 도와드려요.':state.browseMode==='explore'?'새로운 분야를 넓게 보여드려요. 고르지 않은 작품은 싫어한다고 판단하지 않아요.':state.selected.length>=3?'고른 작품과 관련된 분야와 새로운 분야를 함께 보여드려요.':'여러 장르에서 골랐어요. 찾는 분야가 있으면 장르를 눌러주세요.';
  $('batch-notice').textContent=state.batchNotice||'';
  $('search').value = state.query;
  const list = resultListing();
  $('list-label').innerHTML = `<strong>${esc(listHeading(list))}</strong>`;
  $('catalog').innerHTML = list.length ? list.map(cardMarkup).join('') : '<div class="empty" style="grid-column:1/-1">찾는 작품이 없나요? 분야·장르 조건을 지우고 제목으로 찾아보세요.</div>';
  save();
}
function togglePick(id){
  state.optionsConfirmed=false;
  state.recommendSeen={match:[],similar:[],discover:[]};
  const idx = state.selected.indexOf(id);
  if(idx >= 0) state.selected.splice(idx, 1);
  else {const same=state.selected.findIndex(x=>ENGINE.isSameIP(BY_ID[x],BY_ID[id]));if(same>=0){state.selected[same]=id;toast('같은 원작의 다른 형식으로 바꿨어요.');}else if(state.selected.length<10)state.selected.push(id);else return toast('최대 10편까지 골라주세요.');state.disliked=state.disliked.filter(x=>!ENGINE.isSameIP(BY_ID[x],BY_ID[id]));}
  state.pivot = state.selected.includes(state.pivot) ? state.pivot : (state.selected[0] || null);
  const y = window.scrollY;
  renderSelection(true);
  window.scrollTo(0, y);
}
function toggleDislike(id){
  state.optionsConfirmed=false;
  state.recommendSeen={match:[],similar:[],discover:[]};
  state.disliked = state.disliked || [];
  const idx=state.disliked.indexOf(id);
  if(idx>=0) state.disliked.splice(idx,1);
  else {
    state.recommendSeen={match:[],similar:[],discover:[]};state.disliked.push(id);
    state.selected=state.selected.filter(x=>!ENGINE.isSameIP(BY_ID[x],BY_ID[id]));
  }
  state.pivot = state.selected.includes(state.pivot) ? state.pivot : (state.selected[0] || null);
  const y=window.scrollY;
  renderSelection(true);
  window.scrollTo(0,y);
}

function renderTagOptions(){
 const suggestions=optionSuggestions||PREFERENCES.suggest(state);
 for(const [kind,key,id]of [['liked','likedTags','trait-opts'],['avoided','avoidedTags','exclude-opts']]){
  const items=suggestions[kind]||[],selected=new Set(state[key]);
  const visible=optionExpanded[kind]?items:items.filter((x,i)=>i<6||selected.has(x.value));
  $(id).innerHTML=visible.length?visible.map(x=>`<label class="taste-tag"><input type="checkbox" name="${key}" aria-label="${esc(x.label)}" value="${esc(x.value)}" ${selected.has(x.value)?'checked':''}><span>${esc(x.label)}</span></label>`).join(''):'<p class="sub">지금 고른 작품에서는 뚜렷한 태그를 찾지 못했어요. 맞는 태그가 없으면 ‘특별히 없음’을 골라주세요.</p>';
  const more=$(kind+'-more');more.classList.toggle('hidden',items.length<=6);more.textContent=optionExpanded[kind]?'접기':'태그 더 보기';
  $(kind+'-evidence').innerHTML=visible.length?`<summary>어떤 작품에서 나온 태그인가요?</summary><div>${visible.map(x=>`<p><strong>${esc(x.label)}</strong> · ${esc((x.evidence||[]).slice(0,3).join(' · ')||'직접 선택한 태그')}</p>`).join('')}</div>`:'';
 }
 const why=suggestions.avoidBasis;
 $('avoid-hint').textContent=why==='disliked'?'별로예요·관심 없어요로 표시한 작품에서 찾았어요. 정말 피하고 싶은 것만 골라주세요.':why==='opposite'?'별로예요 표시가 없어, 고른 작품과 다른 성향을 제안했어요. 이런 요소도 피하고 싶은지 골라주세요.':negativeExtra().length?'좋아했던 작품과 별로였던 작품 사이에서 구별되는 요소를 찾지 못했어요. 맞는 태그가 없으면 ‘특별히 없음’을 골라주세요.':'뚜렷한 반대 성향을 찾지 못했어요. 맞는 태그가 없으면 ‘특별히 없음’을 골라주세요.';
}
function optionsAnswered(){
 return (state.likedTags.length>0||state.preferenceNone.liked)&&(state.avoidedTags.length>0||state.preferenceNone.avoided)&&typeIndex()!==null;
}
function updateOptionsStatus(){
 for(const [kind,key]of [['liked','likedTags'],['avoided','avoidedTags']]){
  if(state[key].length)state.preferenceNone[kind]=false;
  $(kind+'-none').setAttribute('aria-pressed',String(state.preferenceNone[kind]));
 }
 renderCardQuestions();$('finish').disabled=!optionsAnswered();
 $('options-status').textContent=optionsAnswered()?'두 항목을 확인했어요. 이제 결과를 볼 수 있어요.':typeIndex()===null?'카드 완성을 위한 질문에도 답해 주세요.':'좋아하는 요소와 피하고 싶은 내용을 각각 골라주세요. 특별히 없다는 답도 괜찮아요.';
}
function renderOptions(){
 if(state.selected.length<5){renderSelection();return;}
 state.stage='options';showStage('options');optionSuggestions=PREFERENCES.suggest(state);
 $('preferred-media-opts').innerHTML=MEDIA.slice(1).map(m=>`<label class="taste-tag"><input type="checkbox" name="preferredMedia" aria-label="${m}" value="${m}" ${state.preferredMedia.includes(m)?'checked':''}><span>${m}</span></label>`).join('');
 renderTagOptions();$('priority-opts').innerHTML=`<label class="recent-choice"><input type="checkbox" name="priority" value="new" ${state.priority.includes('new')?'checked':''}><span>최근 나온 작품부터 보기</span></label>`;
 const learning=ENGINE.learnedTags(state);$('learned-note').textContent=learning.excluded.length?'별로예요 3편 이상에 반복된 태그는 자동 제외 중이에요: '+learning.excluded.map(t=>ENGINE.labels.tag(t)+' ('+learning.negative[t]+'편)').join(' · '):'별로예요 1~2편의 태그는 추천에 영향을 주지 않아요. 같은 태그가 3편 이상에 반복되면 자동 제외해요.';
 $('option-picks').innerHTML='';updateOptionsStatus();save();
}
const CARD_AXES=[
 {key:'tempo',low:'tempo-slow',high:'tempo-fast',threshold:55,title:'이야기가 이어지는 속도는?',labels:['차근차근 쌓이는 전개','빠르게 이어지는 전개']},
 {key:'mood',low:'mood-light',high:'mood-heavy',threshold:55,title:'어떤 분위기에 더 끌리나요?',labels:['가볍고 편안한 분위기','묵직하고 진지한 분위기']},
 {key:'resolve',low:'resolve-linger',high:'resolve-payoff',threshold:50,title:'이야기를 보고 남는 감각은?',labels:['긴장과 여운이 오래 남는 쪽','갈등이 풀려 시원해지는 쪽']},
 {key:'unusual',low:'world-familiar',high:'world-unfamiliar',threshold:50,title:'어떤 배경에 더 끌리나요?',labels:['현실에 가까운 배경','낯선 설정과 세계관']}
];
function cardEvidence(){
 const p=scoreProfile(chosen());
 return CARD_AXES.map(axis=>{
  const l='axis:'+axis.low,h='axis:'+axis.high;
  const pref=Number(state.likedTags.includes(h))-Number(state.likedTags.includes(l))+Number(state.avoidedTags.includes(l))-Number(state.avoidedTags.includes(h));
  const answer=state.cardAnswers[axis.key];
  return {...axis,missing:p[axis.key]===null&&!pref,bit:pref?Number(pref>0):(answer===0||answer===1)?answer:p[axis.key]===null?null:Number(p[axis.key]>=axis.threshold)};
 });
}
function renderCardQuestions(){
 const missing=cardEvidence().filter(x=>x.missing);
 const signature=missing.map(a=>a.key).join('|');
 if($('card-questions').dataset.axesSignature===signature){
  $('card-questions').querySelectorAll('[data-card-axis]').forEach(input=>input.checked=state.cardAnswers[input.dataset.cardAxis]===Number(input.value));
  return;
 }
 $('card-questions').dataset.axesSignature=signature;
 $('card-questions').classList.toggle('hidden',!missing.length);
 $('card-questions').innerHTML=missing.length?'<h2>취향 카드 완성하기</h2><p class="sub optional-hint">고른 작품의 정보만으로 알기 어려운 부분이에요. 아래 항목만 알려주세요.</p>'+missing.map(a=>`<fieldset class="card-question"><legend>${esc(a.title)}</legend>${a.labels.map((label,i)=>`<label class="taste-tag"><input type="radio" name="card-${a.key}" data-card-axis="${a.key}" value="${i}" ${state.cardAnswers[a.key]===i?'checked':''}><span>${esc(label)}</span></label>`).join('')}</fieldset>`).join(''):'';
}
function typeIndex(){const axes=cardEvidence();if(!chosen().length||axes.some(a=>a.bit===null))return null;return axes.reduce((n,a)=>n*2+a.bit,0);}
function classified(){const idx=typeIndex();return idx===null?null:{idx,label:TYPES[idx].label,card:TYPES[idx].card};}
function shareSlug(idx){return TYPES[idx].key;}
function shareLookup(slug){return TYPES.findIndex((t,i)=>t.key===slug||(t.label.split(' ').slice(-1)[0]+'-'+i.toString(36))===slug);}

function cardImg(label, src, cls=''){ return `<img src="${src}" alt="${esc(label)} 결과 카드" class="${cls}">`; }

function renderHistory(){
 const hist=Object.entries(state.feedback);$('feedback-history').classList.toggle('hidden',!hist.length);
 $('feedback-entries').innerHTML=hist.map(([id,f])=>`<div class="feed-line"><span>${esc(BY_ID[id]?.title||'작품')} · ${esc((FEEDBACK.find(x=>x[0]===f.status)||[])[1])}${f.reason?' · '+esc((STOP_REASONS.find(x=>x[0]===f.reason)||[])[1]):''}</span><button type="button" data-undo="${id}">취소</button></div>`).join('');
}

function recommend(){return ENGINE.recommend(state,{limit:3});}
function feedbackMenu(w){
  const current = state.feedback[w.id];
  const buttons = FEEDBACK.filter(([status])=>!['want','no'].includes(status)).map(([s,label]) => `<button type="button" data-feedback="${w.id}" data-fb-status="${s}" class="${current && current.status === s ? 'active' : ''}">${label}</button>`).join('');
  const stops = state.stopPending === w.id ? `<div class="feed-menu"><span class="inline-label" style="width:100%">괜찮다면 이유도 알려주세요 · 선택 사항</span>${STOP_REASONS.map(([s,label]) => `<button type="button" data-stop-reason="${w.id}" data-reason="${s}">${label}</button>`).join('')}</div>` : '';
  return `<div class="feed-menu">${buttons}</div>${stops}`;
}
function renderRecommendation(){
 REC=recommend();const mode=state.mode;
 document.querySelectorAll('#mode-tabs button').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.textContent=`${MODE_INFO[b.dataset.mode][0]} · ${(REC[b.dataset.mode]||[]).length}`;});
 $('mode-description').textContent=MODE_INFO[mode][1]+(mode==='similar'&&REC.diagnostics?.similarTiers?.secondaryShown?' 가까운 1순위가 부족해, 공통 요소가 있는 2순위로 보충했어요.':'');$('pivot-control').classList.toggle('hidden',mode!=='similar');
 $('pivot').innerHTML=chosen().map(w=>`<option value="${w.id}">${esc(w.title)}</option>`).join('');$('pivot').value=state.pivot||state.selected[0];
 const markup=(r,uncertain=false)=>{const w=r.work;const sources=(r.supportSources||r.sources||(r.source?[r.source]:[])).filter(Boolean);return `<article class="recommend" data-rec="${w.id}">${poster(w,true)}<div class="rec-body"><div class="rec-header"><strong>${esc(w.title)}</strong><span class="badge">${esc(w.media)}</span></div>${r.similarityTier?`<span class="rec-tier tier-${r.similarityTier}">${r.similarityTier===1?'1순위 · 가까운 전개':'2순위 · 공통 요소로 넓힌 추천'}</span>`:''}<p class="rec-reason">${esc(r.reason)}</p>${r.comparisonNotice?`<p class="rec-comparison">${esc(r.comparisonNotice)}</p>`:''}${r.difference?`<p class="rec-difference">다른 점 · ${esc(r.difference)}</p>`:''}${sources.length?`<p class="rec-source">기준 작품 · ${sources.slice(0,3).map(x=>esc(x.title)).join(' · ')}</p>`:''}<p class="rec-platform">${esc((w.platforms||[]).slice(0,3).join(' · '))}</p>${r.qualityLabel?`<p class="rec-quality">${esc(r.qualityLabel)}</p>`:''}${!uncertain&&r.conditionNotice?`<p class="rec-caution">${esc(r.conditionNotice)}. 작품 소개에서 더 확인할 수 있어요.</p>`:''}${uncertain?`<p class="uncertain-note">${esc(r.conditionNotice||'작품 분류 정보 보완 필요')}. 확인된 추천과 구분해서 살펴봐 주세요.</p>`:`<div class="rec-buttons"><button type="button" data-feedback="${w.id}" data-fb-status="want" aria-pressed="${state.feedback[w.id]?.status==='want'}">${state.feedback[w.id]?.status==='want'?'✓ ':''}보고 싶어요</button><button type="button" data-open-feedback="${w.id}">봤어요</button><button type="button" data-feedback="${w.id}" data-fb-status="no">관심 없어요</button></div>${state.openFeedback===w.id?feedbackMenu(w):''}`}</div></article>`;};
 const data=REC[mode]||[],diagnosis=REC.diagnostics?.modeReasons?.[mode];
 const emptyMessages={
  info_missing:['비슷한 작품을 비교할 정보가 더 필요해요.','기준 작품의 배경이나 주된 전개 정보가 아직 부족해요. 같은 분야에서 좋아하는 작품을 더 찾거나, 다른 기준 작품을 골라볼 수 있어요.'],
  conditions:['현재 선택한 조건에 맞는 후보가 없어요.','추천받을 분야와 피하고 싶은 태그를 확인해 주세요.'],
  history_exhausted:['이 조건에서 찾은 추천을 모두 살펴봤어요.','이 조건의 추천 다시 보기로 앞서 본 작품을 다시 확인할 수 있어요.'],
  no_structural_match:['구체적인 연결점을 확인한 작품이 아직 없어요.','같은 장르여도 전개와 갈등의 결이 다를 수 있어요. 같은 분야의 작품을 더 찾아보거나 기준 작품을 바꿔보세요.']
 };
 const empty=diagnosis?.cause==='other_modes'?['다른 픽과 겹치는 작품은 반복하지 않아요.','다른 추천 탭에서 먼저 살펴보거나 기준 작품을 바꿔보세요.']:emptyMessages[diagnosis?.code]||['비교할 수 있는 추천 후보가 아직 없어요.','선택한 작품의 정보와 취향 조건을 확인해 주세요.'];
 $('recommend-list').innerHTML=data.length?data.map(r=>markup(r)).join(''):`<div class="empty"><strong>${esc(empty[0])}</strong><br>${esc(empty[1])}</div>`;
 const pending=REC.uncertain?.[mode]||[];$('uncertain-list').innerHTML=pending.length?`<details class="uncertain"><summary>내용 확인이 필요한 비교 후보 ${pending.length}편</summary><p class="sub">추천에서 보류한 작품이에요. 닮은 점은 있지만 배경·진행 방식이나 선택한 제외 조건을 확인할 정보가 부족해요.</p>${pending.map(r=>markup(r,true)).join('')}</details>`:'';
 $('recommend-footnote').textContent=data.length<3?'근거가 있는 작품만 보여드려요. 다른 픽과 같은 원작은 중복하지 않아요.':'등록된 작품 정보로 비교했어요. 잠정 분류가 포함되며, 실제 감상처와 세부 내용은 달라질 수 있어요.';
 $('restart-recommendations').classList.toggle('hidden',!(state.recommendSeen[mode]?.length));
 renderHistory();save();
}
function setFeedback(id, status, reason=null){
  if(status === 'stopped' && !reason){ state.stopPending = id; state.openFeedback = id; renderRecommendation(); return; }
  if(status==='want'&&state.feedback[id]?.status==='want')delete state.feedback[id];else state.feedback[id]={status,reason};
  state.recommendSeen={match:[],similar:[],discover:[]};
  state.stopPending = null; state.openFeedback = null;
  renderResult(true);
  toast('반응을 반영해 추천을 다시 계산했어요.');
}
function renderResult(preserve=false){
 if(state.selected.length<5){state.stage='select';renderSelection();return toast('좋아하는 작품을 5편 이상 골라주세요.');}
 if(!state.optionsConfirmed||!optionsAnswered()){renderOptions();return;}
 state.stage='result';showStage('result',!preserve);const t=classified();
 state.type=t?.idx??null;state.pivot=state.selected.includes(state.pivot)?state.pivot:state.selected[0];
 $('animal').classList.toggle('hidden',!t);$('animal').innerHTML=t?cardImg(t.label,t.card):'';
 $('animal-title').textContent=t?t.label:'작품의 정보를 더 확인하고 있어요';$('animal-desc').textContent=t?'고른 작품과 직접 고른 취향을 함께 반영한 카드예요.':'일부 작품의 축 정보가 부족해 카드 판정을 보류했어요. 추천은 확인된 연결점으로 찾아요.';
 $('confidence').textContent=t?'여러 취향이 함께 있을 수 있어요. 추천은 카드 유형과 별도로 작품을 비교해요.':'';
 $('edit-picks').textContent=state.selected.length<10?`작품을 더 골라 추천 다듬기 (${state.selected.length}/10)`:'고른 작품 바꾸기';
 const groups=new Map();chosen().forEach(w=>{if(w.enginePrimary)groups.set(w.enginePrimary,(groups.get(w.enginePrimary)||0)+1);});
 $('taste-groups').innerHTML=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,n])=>`<span>${esc(window.CHALPICK_META?.engineDictionary?.[k]?.label||k)} · ${n}편</span>`).join('');
 updateShareScope();$('share-btn').disabled=!t;$('result-picks').innerHTML='';renderRecommendation();save();
}
function sharedCard(idx){ const t = TYPES[idx]; return `<div class="share-card card-image">${cardImg(t.label,t.card)}</div>`; }
function renderShare(idx){sharedIndex=idx;showStage('share');$('share-card').innerHTML=sharedCard(idx);$('friend-type').textContent=TYPES[idx].label;updateShareScope();}
function baseRoute(){const at=location.pathname.indexOf('/result/type-');return at>=0?location.pathname.slice(0,at+1):location.pathname;}
function clearAll(){
 state=fresh();sharedIndex=null;currentStage='';document.body.removeAttribute('data-shared-type');history.replaceState(null,'',baseRoute());makeBatch(true);renderSelection();toast('선택과 감상 기록을 지우고 여러 분야의 작품으로 다시 시작했어요.');
}
function renderCatalogOnly(){
  const list = resultListing();
  $('catalog').innerHTML = list.length ? list.map(cardMarkup).join('') : '<div class="empty" style="grid-column:1/-1">검색 결과가 없어요. ‘조건 지우기’로 전체 작품에서 다시 찾아보세요.</div>';
  $('list-label').textContent = listHeading(list);
  save();
}
function readShare(){return new URLSearchParams(location.hash.slice(1)).get('share')||new URLSearchParams(location.search).get('share')||document.body.dataset.sharedType||'';}
function appStart(){
 const slug=readShare();if(slug){const idx=shareLookup(slug);if(idx>=0){renderShare(idx);return;}toast('결과 링크를 확인할 수 없어 취향테스트로 이동했어요.');history.replaceState(null,'',baseRoute());}
 sharedIndex=null;if(!state.display.length)makeBatch(true);if(state.selected.length<5&&state.stage!=='select')state.stage='select';
 if(state.stage==='result')renderResult();else if(state.stage==='options')renderOptions();else renderSelection();
}
$('catalog').addEventListener('click', e => { const dislike=e.target.closest('[data-dislike]'); if(dislike){ toggleDislike(dislike.dataset.dislike); return; } const b = e.target.closest('[data-pick]'); if(b) togglePick(b.dataset.pick); });
[$('picked-pills'), $('sidebar-list')].forEach(parent => parent.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if(b) togglePick(b.dataset.remove); }));
const dislikedSummary=$('disliked-summary'); if(dislikedSummary) dislikedSummary.addEventListener('click',e=>{const b=e.target.closest('[data-undislike]'); if(b) toggleDislike(b.dataset.undislike);});
$('expand-picks').addEventListener('click', () => { state.expanded = !state.expanded; renderPickedSummary(); save(); });
$('search').addEventListener('compositionstart', () => composing = true);
$('search').addEventListener('compositionend', e => { composing = false; state.query = e.target.value; renderCatalogOnly(); });
$('search').addEventListener('input', e => { if(composing||e.isComposing) return; state.query = e.target.value; renderCatalogOnly(); });
$('media-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-medium]'); if(!b) return;
  const medium = b.dataset.medium;
  if(medium === '전체'){
    state.mediaFilters = [];
  } else {
    const set = new Set(state.mediaFilters || []);
    if(set.has(medium)) set.delete(medium); else set.add(medium);
    state.mediaFilters = [...set];
  }
  state.query = ''; state.all = false; state.display = []; state.last = [];
  makeBatch(true); renderSelection();
});
$('refresh').addEventListener('click',()=>{makeBatch();renderSelection(true);$('catalog').scrollIntoView({block:'start',behavior:'instant'});$('catalog').focus({preventScroll:true});});
$('genre-tabs').addEventListener('click',e=>{
 if(e.target.closest('[data-genre-more]')){genresExpanded=!genresExpanded;genreTabs();return;}
 const b=e.target.closest('[data-genre]');if(!b)return;
 const key=b.dataset.genre,set=new Set(state.genreFilters);
 if(key==='all')set.clear();else if(set.has(key))set.delete(key);else set.add(key);
 state.genreFilters=[...set];makeBatch();renderSelection(true);
});
$('clear-filters').addEventListener('click',()=>{state.mediaFilters=[];state.genreFilters=[];makeBatch();renderSelection(true);});
$('search-all').addEventListener('click',()=>{state.mediaFilters=[];state.genreFilters=[];if(state.query){mediaTabs();genreTabs();renderCatalogOnly();}else{makeBatch();renderSelection(true);}});

$('go-options').addEventListener('click',()=>{state.optionsConfirmed=false;renderOptions();});
$('card-questions').addEventListener('change',e=>{const key=e.target.dataset.cardAxis;if(!CARD_AXES.some(a=>a.key===key))return;state.cardAnswers[key]=Number(e.target.value);state.optionsConfirmed=false;updateOptionsStatus();save();});
$('back-select').addEventListener('click', () => { state.stage = 'select'; renderSelection(); });
for(const [kind,key,id]of [['liked','likedTags','trait-opts'],['avoided','avoidedTags','exclude-opts']]){
 $(kind+'-none').addEventListener('click',()=>{state[key]=[];state.preferenceNone[kind]=!state.preferenceNone[kind];state.optionsConfirmed=false;state.recommendSeen={match:[],similar:[],discover:[]};renderTagOptions();updateOptionsStatus();save();});
 $(id).addEventListener('change',e=>{
  if(!e.target.matches('input[type=checkbox]'))return;
  state.optionsConfirmed=false;state.preferenceNone[kind]=false;const values=new Set(state[key]);if(e.target.checked)values.add(e.target.value);else values.delete(e.target.value);state[key]=[...values];
  const other=key==='likedTags'?'avoidedTags':'likedTags';if(e.target.checked)state[other]=state[other].filter(x=>x!==e.target.value);
  document.querySelectorAll('#trait-opts input,#exclude-opts input').forEach(input=>{if(input.name===other&&input.value===e.target.value)input.checked=false;});
  state.recommendSeen={match:[],similar:[],discover:[]};updateOptionsStatus();save();
 });
 $(kind+'-more').addEventListener('click',()=>{optionExpanded[kind]=!optionExpanded[kind];renderTagOptions();});
}
$('preferred-media-opts').addEventListener('change', e => {
  if(!e.target.closest('input[type=checkbox]')) return;
  state.preferredMedia = [...$('preferred-media-opts').querySelectorAll('input:checked')].map(x=>x.value);state.recommendSeen={match:[],similar:[],discover:[]};
  updateOptionsStatus();
  save();
});
$('finish').addEventListener('click',()=>{if(!optionsAnswered())return toast('선호와 제외 항목을 모두 확인해 주세요.');state.optionsConfirmed=true;const available=recommend();if(!available[state.mode]?.length)state.mode=['match','similar','discover'].find(mode=>available[mode]?.length)||state.mode;renderResult();});
$('mode-tabs').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if(!b) return; state.mode = b.dataset.mode; state.openFeedback = null; state.stopPending = null; renderRecommendation(); });
$('pivot').addEventListener('change', e => { state.recommendSeen={match:[],similar:[],discover:[]};state.pivot = e.target.value; renderRecommendation(); });


function openResultCard(){ const idx=sharedIndex??typeIndex(); if(idx===null) return; $('zoom-content').innerHTML=cardImg(TYPES[idx].label,TYPES[idx].card,'dialog-cardimg'); $('card-dialog').showModal(); }
const zoomBtn=$('zoom-card'); if(zoomBtn) zoomBtn.addEventListener('click',openResultCard);
const animalCard=$('animal'); if(animalCard){ animalCard.addEventListener('click',openResultCard); animalCard.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();openResultCard();} }); }
$('close-card').addEventListener('click', () => $('card-dialog').close());
function updateShareScope(){const local=location.protocol==='file:'||['127.0.0.1','localhost'].includes(location.hostname);document.querySelectorAll('.share-scope').forEach(el=>el.textContent=local?'지금은 이 컴퓨터에서 확인하는 미리보기예요. 복사한 주소는 다른 컴퓨터에서 열리지 않아요.':'취향 카드 유형만 공유해요. 고른 작품과 감상 기록은 링크에 포함되지 않아요.');}
function currentShareUrl(){
 const idx=typeIndex();if(idx===null)return null;const url=new URL(location.href);url.hash='';url.search='';if(location.protocol!=='file:')url.pathname=baseRoute();url.hash='share='+encodeURIComponent(shareSlug(idx));return url.href;
}
async function copyShareLink(){
  const url=currentShareUrl();
  if(!url) return;
  try{ await navigator.clipboard.writeText(url); toast('공유 링크를 복사했어요.'); }
  catch(e){ const x=document.createElement('input'); x.value=url; document.body.appendChild(x); x.select(); const ok=document.execCommand('copy'); x.remove(); toast(ok?'공유 링크를 복사했어요.':'주소를 직접 복사해 주세요.'); }
}
const shareBtn=$('share-btn'); if(shareBtn) shareBtn.addEventListener('click',copyShareLink);
const copyTestLink=$('copy-test-link'); if(copyTestLink) copyTestLink.addEventListener('click',async()=>{
  const testUrl=location.href.split('#')[0];
  try{ await navigator.clipboard.writeText(testUrl); toast('취향테스트 링크를 복사했어요.'); }
  catch(e){ const x=document.createElement('input'); x.value=testUrl; document.body.appendChild(x); x.select(); const ok=document.execCommand('copy'); x.remove(); toast(ok?'취향테스트 링크를 복사했어요.':'주소를 직접 복사해 주세요.'); }
});

$('try-own').addEventListener('click',clearAll);
$('reset').addEventListener('click',clearAll);
window.addEventListener('hashchange',appStart);
window.addEventListener('popstate',e=>{historyReplaying=true;try{if(!readShare())state.stage=e.state?.chalpickStage||'select';appStart();}finally{historyReplaying=false;}});
$('share-card').addEventListener('click',openResultCard);
$('share-card').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openResultCard();}});


for(const [id,key]of [['priority-opts','priority']])$(id).addEventListener('change',()=>{state[key]=[...$(id).querySelectorAll('input:checked')].map(x=>x.value);state.recommendSeen={match:[],similar:[],discover:[]};save();});
$('edit-picks').addEventListener('click',()=>{state.stage='select';renderSelection();});
$('edit-options').addEventListener('click',renderOptions);
$('restart-recommendations').addEventListener('click',()=>{state.recommendSeen[state.mode]=[];renderRecommendation();toast('앞서 본 추천을 다시 보여드려요.');});
$('recommend-list').addEventListener('click',e=>{const b=e.target.closest('[data-feedback]');if(b)return setFeedback(b.dataset.feedback,b.dataset.fbStatus);const stop=e.target.closest('[data-stop-reason]');if(stop)return setFeedback(stop.dataset.stopReason,'stopped',stop.dataset.reason);const open=e.target.closest('[data-open-feedback]');if(open){state.openFeedback=state.openFeedback===open.dataset.openFeedback?null:open.dataset.openFeedback;renderRecommendation();}});
$('feedback-entries').addEventListener('click',e=>{const b=e.target.closest('[data-undo]');if(b){delete state.feedback[b.dataset.undo];state.recommendSeen={match:[],similar:[],discover:[]};renderResult(true);}});
$('save-card').addEventListener('click',()=>{const idx=sharedIndex??typeIndex();if(idx===null)return;const a=document.createElement('a');a.href=TYPES[idx].card;a.download='찰픽-'+TYPES[idx].label+'.webp';document.body.append(a);a.click();a.remove();});

appStart();

