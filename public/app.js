import {PROFILE_KEY,loadProfile,saveProfile,activateSampleProfile,tasteMatch,sortByTaste,similarPicks,discoveryPicks,discoveryReason,immersivePicks,themeById,matchesTheme,sameCreatorWorks,sameNameCreatorCandidates} from './recommendation.js';
import {chooseVisitTheme} from './context.js';
import {initAuth} from './auth.js';
import {matchesSelectedTags,facetCounts} from './facets.js';
import {loadLiveCatalog,catalogCountLabel,safePublicURL,safeImageURL} from './catalog-client.js';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=safePublicURL;
const norm=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');
const getStorage=()=>{try{return globalThis.localStorage;}catch{return null;}},heroPageSize=()=>window.innerWidth<=600?1:window.innerWidth<=850?2:3;
const BOOKMARK_KEY='chalpick-main-bookmarks-v1',TYPES=['웹툰','웹소설','드라마·OTT','영화'],HIDDEN_PLATFORMS=new Set(['문피아','미스터블루']);
const GROUPS=[{id:'genre',label:'장르'},{id:'setting',label:'소재·배경'},{id:'relationship',label:'인물·관계'}],actorRoles=new Set(['LEAD_ACTOR','SUPPORT_ACTOR']);
const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4Z"/></svg>';
let items=[],byId=new Map(),taxonomy={groups:[]},popular={lists:[]},results=[],visibleCount=12,heroPage=0,heroItems=[],renderedHeroPageSize=heroPageSize(),profile=loadProfile(getStorage()),saved=new Set(),toastTimer,previousFocus,popularTab='',visitContext=null,weatherContext=null,contextPromise=null;
let catalogMeta=null,catalogLoading=false;
const dialogStack=[];
try{const v=JSON.parse(localStorage.getItem(BOOKMARK_KEY)||'[]');if(Array.isArray(v))saved=new Set(v.filter(Number.isInteger));}catch{}
const state={types:[],platforms:[],tags:{genre:[],setting:[],relationship:[]},query:'',sort:'taste',tab:'genre',expanded:false,theme:'',mode:'all',person:''};
const media=item=>['드라마','OTT'].includes(item.type)?'드라마·OTT':item.type, format=v=>Number(v).toLocaleString('ko-KR'), groupTags=(item,g)=>item.tagGroups?.[g]||[];
function uniqueIPs(list){const seen=new Set();return list.filter(item=>{const key=item.ipId||norm(item.title.replace(/\(소설\)$/,''));if(seen.has(key))return false;seen.add(key);return true;});}
function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function readLocation(){const p=new URLSearchParams(location.search);state.types=p.getAll('type').filter(t=>TYPES.includes(t)).slice(0,1);state.platforms=p.getAll('platform').filter(p=>!HIDDEN_PLATFORMS.has(p));for(const g of GROUPS)state.tags[g.id]=p.getAll(g.id);state.query=(p.get('q')||'').slice(0,200);state.sort=['taste','latest','title'].includes(p.get('sort'))?p.get('sort'):'taste';state.theme=themeById(p.get('theme'))?.id||'';state.mode=['discovery','immersive'].includes(p.get('mode'))?p.get('mode'):'all';state.person=(p.get('cast')||'').slice(0,80);}
function syncLocation(workId=null,replace=false){const u=new URL(location.href);for(const k of ['type','genre','setting','relationship','platform','q','sort','theme','mode','cast','work'])u.searchParams.delete(k);for(const v of state.types)u.searchParams.append('type',v);for(const v of state.platforms)u.searchParams.append('platform',v);for(const g of GROUPS)for(const t of state.tags[g.id])u.searchParams.append(g.id,t);for(const[k,v]of [['q',state.query],['sort',state.sort==='taste'?'':state.sort],['theme',state.theme],['mode',state.mode==='all'?'':state.mode],['cast',state.person],['work',workId]])if(v)u.searchParams.set(k,v);if(u.href!==location.href)history[replace?'replaceState':'pushState']({},'',u);}
function image(item,className='cover-image',eager=false){const src=safeImageURL(item.image);return src?`<img class="${className}" src="${E(src)}" alt="${E(item.title)} 표지" loading="${eager?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer">`:'';}
function card(item,{badge='',tags=false,eager=false,discovery=false}={}){const m=tasteMatch(item,profile);return `<article class="work-card" data-card-id="${item.id}"><button class="cover-button" data-work="${item.id}" aria-label="${E(item.title)} 상세 보기"><span class="cover-fallback" aria-hidden="true"><span class="fallback-mark">✦</span>${E(item.title)}</span>${image(item,'cover-image',eager)}<span class="cover-badge ${badge?'editor':''}">${E(badge||item.type)}</span></button><button class="bookmark" data-save="${item.id}" aria-pressed="${saved.has(item.id)}" aria-label="${E(item.title)} ${saved.has(item.id)?'보관 취소':'보관하기'}">${icon}</button><button class="card-title" data-work="${item.id}" title="${E(item.title)}">${E(item.title)}</button><p class="card-meta">${E(item.type)} · ${E(item.creators.slice(0,2).join(' / ')||item.genre||'')}</p>${discovery?`<p class="discovery-reason">${E(discoveryReason(item,profile))}</p>`:tags?`<p class="card-tags">${item.tags.slice(0,2).map(t=>'#'+E(t)).join(' ')}</p>`:''}${m.matched.length?`<p class="taste-match" title="${E(m.matched.join(' · '))}">✦ 취향 키워드 ${m.matched.length}개 일치</p>`:''}</article>`;}
function renderHero(){heroItems=uniqueIPs(sortByTaste(items.filter(i=>i.image),profile)).slice(0,6);renderedHeroPageSize=heroPageSize();const pages=Math.max(1,Math.ceil(heroItems.length/renderedHeroPageSize));heroPage%=pages;$('#hero-grid').innerHTML=heroItems.slice(heroPage*renderedHeroPageSize,(heroPage+1)*renderedHeroPageSize).map((item,i)=>{const m=tasteMatch(item,profile);return `<button class="hero-card ${['featured','rose','teal'][i]}" data-work="${item.id}" aria-label="${E(item.title)} 상세 보기"><span class="hero-text"><span class="hero-kicker">${E(m.matched.join(' · ')||item.genre)}</span><h2>${E(item.title.replace(/\(소설\)$/, ''))}</h2><span class="hero-subtitle">${E(i===0?(item.description||'').slice(0,72)+((item.description||'').length>72?'…':''):`${item.type} · ${item.genre}`)}</span><span class="hero-cta">작품 만나보기 <span class="arrow" aria-hidden="true">↗</span></span></span>${image(item,'hero-art',true)}</button>`;}).join('');$('#hero-page').innerHTML=`<b>${String(heroPage+1).padStart(2,'0')}</b> / ${String(pages).padStart(2,'0')}`;$('#profile-caption').textContent=`${profile.name} · 취향 추천`;$('.temporary-label').textContent=profile.temporary?'임시 취향':'내 취향';}
function renderShelves(){$('#curated-grid').innerHTML=uniqueIPs(immersivePicks(items,profile,30)).slice(0,6).map(i=>card(i,{badge:'취향 PICK',tags:true,eager:true})).join('');$('#discovery-grid').innerHTML=uniqueIPs(discoveryPicks(items,profile,12)).slice(0,6).map(i=>card(i,{badge:'발견 PICK',discovery:true})).join('');}
function baseCandidates(){return state.mode==='discovery'?discoveryPicks(items,profile,items.length):state.mode==='immersive'?immersivePicks(items,profile,items.length):items;}
function matches(item){
  if(item.adult===true)return false;
  if(state.types.length&&!state.types.includes(media(item)))return false;
  if(state.platforms.length&&!item.platforms.some(p=>state.platforms.includes(p.name)))return false;
  if(!matchesSelectedTags(item,state.tags))return false;
  if(state.theme&&!matchesTheme(item,themeById(state.theme)))return false;
  if(state.person&&!item.credits.some(c=>actorRoles.has(c.role)&&norm(c.name)===norm(state.person)))return false;
  return !state.query||item.searchText.includes(norm(state.query));
}
function chip(label,count,dimension,selected){const unavailable=count===0&&!selected&&dimension!=='platform';return `<button class="facet-chip ${selected?'active':''} ${count===0?'is-empty':''}" data-facet="${dimension}" data-value="${E(label)}" data-count="${count}" aria-pressed="${selected}" ${unavailable?'disabled':''} title="현재 결과 중 ${E(label)} ${format(count)}개${unavailable?' · 다른 조건을 해제하면 선택할 수 있어요.':''}">${E(label)} <span>${format(count)}</span></button>`;}
function renderFilters(pool=baseCandidates()){
  if(!catalogMeta)return;
  const matchedItems=pool.filter(i=>matches(i));
  const counts=Object.fromEntries(GROUPS.map(g=>[g.id,facetCounts(g.id,matchedItems)]));
  $('#facet-tabs').innerHTML=GROUPS.map(g=>{const total=taxonomy.groups.find(t=>t.id===g.id)?.tags.length||0;return `<button role="tab" id="facet-tab-${g.id}" aria-controls="facet-tag-panel" aria-selected="${state.tab===g.id}" tabindex="${state.tab===g.id?0:-1}" data-tab="${g.id}">${g.label} <span>${counts[g.id].size}/${total}</span>${state.tags[g.id].length?`<b>${state.tags[g.id].length}</b>`:''}</button>`;}).join('');
  $('#facet-tag-panel').setAttribute('aria-labelledby',`facet-tab-${state.tab}`);
  const tags=[...(taxonomy.groups.find(g=>g.id===state.tab)?.tags||[])].sort((a,b)=>(counts[state.tab].get(b.label)||0)-(counts[state.tab].get(a.label)||0)||a.label.localeCompare(b.label,'ko'));
  $('#facet-chips').innerHTML=(state.expanded?tags:tags.slice(0,16)).map(t=>chip(t.label,counts[state.tab].get(t.label)||0,state.tab,state.tags[state.tab].includes(t.label))).join('');
  $('#facet-more').hidden=tags.length<=16;$('#facet-more').textContent=state.expanded?'접기':`더 보기 +${tags.length-16}`;$('#facet-more').setAttribute('aria-expanded',String(state.expanded));
  const pc=facetCounts('platform',matchedItems);
  const platforms=[...new Set(items.filter(i=>!i.adult).flatMap(i=>i.platforms.map(p=>p.name)))].filter(p=>!HIDDEN_PLATFORMS.has(p)).sort((a,b)=>(pc.get(b)||0)-(pc.get(a)||0)||a.localeCompare(b,'ko'));
  $('#platform-chips').innerHTML=platforms.map(t=>chip(t,pc.get(t)||0,'platform',state.platforms.includes(t))).join('');
  $('#search').value=state.query;$('#catalog-search').value=state.query;$('#sort').value=state.sort;
  $('#sort option[value="taste"]').textContent=state.mode==='discovery'?'발견픽 추천순':'취향순';
  $('#taste-summary').textContent=`${profile.temporary?'임시 취향':'내 취향'} · ${profile.preferredTags.join(' · ')}  수정 ›`;
  const active=[...state.types.map(v=>['type',v]),...state.platforms.map(v=>['platform',v]),...GROUPS.flatMap(g=>state.tags[g.id].map(v=>[g.id,v])),...(state.query?[['query',state.query]]:[]),...(state.person?[['person',state.person+' 출연']]:[]),...(state.theme?[['theme',themeById(state.theme).title]]:[]),...(state.mode!=='all'?[['mode',state.mode==='discovery'?'발견픽':'몰입 추천']]:[])];
  $('#active-filters').innerHTML=active.map(([k,v])=>`<button data-clear="${k}" data-value="${E(v)}" aria-label="${E(v)} 필터 해제">${E(v)} <span>×</span></button>`).join('');$('#reset-filters').hidden=!active.length;
  document.body.classList.toggle('filtered',Boolean(state.query||state.theme||state.person||state.mode!=='all'));
  $('#discover-title').textContent=state.theme?themeById(state.theme).title:state.person?`${state.person} 출연작`:state.query?`‘${state.query}’ 검색 결과`:state.mode==='discovery'?'발견픽 · 취향의 다음 장':state.mode==='immersive'?'한번 시작하면, 멈출 수 없는':'취향이 닿는 곳';
  $$('#media-tabs [data-media]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.media===(state.types[0]||'전체'))));
  $('#theme-banner').hidden=!state.theme&&!state.person;
  $('#theme-banner').textContent=state.theme?`${themeById(state.theme).description} · ${state.sort==='taste'?'현재 취향에 맞는 순서로 보여드려요.':'선택한 정렬 방식으로 보여드려요.'}`:state.person?'출연진 이름이 같은 작품입니다. 인물 식별 정보가 없는 경우 동명이인이 포함될 수 있어요.':'';
}
function renderResults(candidates=baseCandidates()){
  if(!catalogMeta)return;
  const pool=candidates.filter(i=>matches(i));
  results=state.sort==='latest'?[...pool].sort((a,b)=>(b.year||0)-(a.year||0)||a.id-b.id):state.sort==='title'?[...pool].sort((a,b)=>a.title.localeCompare(b.title,'ko')):state.mode==='discovery'?pool:sortByTaste(pool,profile);
  $('#results-count').innerHTML=`<strong>${format(results.length)}</strong> 개 작품<br><span>${E(catalogCountLabel(catalogMeta))}</span>`;
  $('#browse-grid').innerHTML=results.slice(0,visibleCount).map(i=>card(i,{tags:true,discovery:state.mode==='discovery'})).join('');
  $('#empty-state').hidden=!!results.length;$('#empty-state').innerHTML='<h3>아직 꼭 맞는 이야기를 찾지 못했어요</h3><p>키워드나 필터를 조금 넓혀보세요.</p><button class="primary-button" data-action="reset">필터 초기화</button>';
  $('#load-more').hidden=visibleCount>=results.length;$('#load-more').textContent=`작품 더 보기 · ${format(Math.max(0,results.length-visibleCount))}편 남음 ⌄`;updateSavedUI();
}
function renderBrowsing(scroll=false){const pool=baseCandidates();renderFilters(pool);renderResults(pool);if(scroll)$('#discover').scrollIntoView({behavior:'instant',block:'start'});}
function resetState(){Object.assign(state,{types:[],platforms:[],tags:{genre:[],setting:[],relationship:[]},query:'',sort:'taste',theme:'',mode:'all',person:'',expanded:false});visibleCount=12;}
function changeFilter(key,value){const values=key==='type'?state.types:key==='platform'?state.platforms:state.tags[key];const index=values.indexOf(value);if(index<0)values.push(value);else values.splice(index,1);visibleCount=12;syncLocation();renderBrowsing();}
function renderPopular(){
  const lists=popular.lists.filter(l=>l.media!=='애니메이션'&&l.status==='available'&&l.entries?.length);if(!lists.length){$('#side-picks').innerHTML='<p class="storage-note">공식 순위를 준비하고 있어요.</p>';return;}
  const list=lists.find(l=>l.id===popularTab)||lists[0];popularTab=list.id;
  $('#popular-tabs').innerHTML=lists.map(l=>`<button data-popular="${E(l.id)}" aria-pressed="${l.id===popularTab}">${E(l.media)}</button>`).join('');
  $('#side-picks').innerHTML=list.entries.filter(e=>!byId.get(e.catalogId)?.adult).slice(0,5).map(e=>{const item=byId.get(e.catalogId),title=e.localizedTitle||e.title,url=safeURL(e.url)||safeURL(list.sourceUrl),season=e.editionWarning&&e.title.match(/(?:Season|시즌)\s*(\d+)/i),edition=season?`시즌 ${season[1]} · 공식 플랫폼`:'공식 플랫폼에서 확인';const content=`<span class="side-rank">${e.rank}</span><span class="popular-cover">${item?.image?image(item,''):E(title.slice(0,1))}</span><span class="side-info"><strong>${E(title)}</strong><small>${E(e.editionWarning?edition:item?item.genre:list.media)}${!item||e.editionWarning?' ↗':''}</small></span>`;return item&&!e.editionWarning?`<button class="side-pick" data-work="${item.id}">${content}</button>`:`<a class="side-pick" href="${E(url)}" ${e.editionWarning?`title="${E(e.editionWarning)}"`:''} target="_blank" rel="noopener noreferrer">${content}</a>`;}).join('');
  const observed=new Date(list.observedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
  $('#popular-source').innerHTML=`<a href="${E(safeURL(list.sourceUrl))}" target="_blank" rel="noopener noreferrer">${E(list.sourceLabel)} ↗</a><p>${E(list.period?.label||'공식 집계 기준')}<br>${observed} 확인 · 플랫폼 원본 순위</p>${list.scope?`<p>${E(list.scope)}</p>`:''}${list.note?`<p>${E(list.note)}</p>`:''}`;
}
function renderContext(){
  const t=visitContext?.theme,box=$('.context-card');
  box.hidden=!t;
  if(!t)return;
  const picks=sortByTaste(items.filter(i=>matchesTheme(i,t)),profile),preview=picks.slice(0,3),weather=t.group==='weather';
  box.dataset.theme=t.id;box.dataset.group=t.group;
  const note=weather?`${weatherContext?.region||'접속 지역'} · 현재 시간대 1시간 예보`:t.group==='event'?'한국 기념일 전후 7일의 이야기':'지금, 한국의 계절에 어울리는 이야기';
  $('#context-content').innerHTML=`<div class="context-scene" aria-hidden="true"><span class="scene-orbit"></span><span class="scene-motif">${E(t.icon||'✦')}</span><span class="scene-line"></span><span class="context-season-label">${E(t.label)}</span></div><p class="context-now">${E(note)}</p><h3>${E(t.title)}</h3><p class="context-description">${E(t.description)}</p><div class="context-preview">${preview.map(item=>`<button data-work="${item.id}" class="context-work" aria-label="${E(item.title)} 상세 보기"><span class="context-cover">${image(item,'')||`<span>${E(item.title)}</span>`}</span><span class="context-work-title">${E(item.title)}</span></button>`).join('')}</div><button class="context-cta" data-theme="${t.id}">${format(picks.length)}편, 내 취향으로 만나보기 <span>↗</span></button><small class="context-footnote">${weather?`<a href="${E(safeURL(weatherContext?.source?.url))}" target="_blank" rel="noopener noreferrer">${E(weatherContext?.source?.name||'MET Norway')}</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a><br>예보를 비·눈 테마로 분류했어요.`:'추천 기사와 작품 소개로 연결한 테마입니다.'}</small>`;
}
async function prepareContext(){
  if(contextPromise)return contextPromise;
  contextPromise=(async()=>{
    try{const response=await fetch('/api/weather',{signal:AbortSignal.timeout(6500)});if(response.ok)weatherContext=await response.json();}catch{weatherContext=null;}
    visitContext=chooseVisitTheme({items,weather:weatherContext?.available?weatherContext.condition:null,storage:getStorage()});
    renderContext();
  })();
  return contextPromise;
}
function updateSavedUI(){$('#saved-count').textContent=saved.size;$('#saved-count').hidden=!saved.size;$$('[data-save]').forEach(b=>{const id=Number(b.dataset.save),has=saved.has(id);b.setAttribute('aria-pressed',String(has));b.setAttribute('aria-label',`${byId.get(id)?.title||'작품'} ${has?'보관 취소':'보관하기'}`);if(b.classList.contains('detail-save'))b.innerHTML=icon+(has?'보관한 작품':'보관하기');});}
function toggleSaved(id){if(!byId.has(id))return;const next=new Set(saved),adding=!next.has(id);if(adding)next.add(id);else next.delete(id);try{localStorage.setItem(BOOKMARK_KEY,JSON.stringify([...next]));}catch{notify('브라우저에 보관함을 저장하지 못했어요.');return;}saved=next;updateSavedUI();if($('#library-dialog').open)renderLibrary();notify(adding?'내 보관함에 담았어요.':'보관함에서 꺼냈어요.');}
function openDialog(dialog){const current=$('dialog[open]');if(current===dialog){dialog.scrollTop=0;$('.dialog-close',dialog).focus();return;}if(current){dialogStack.push({dialog:current,focus:document.activeElement});current.close();}else previousFocus=document.activeElement;dialog.showModal();dialog.scrollTop=0;}
function closeDialog(dialog,updateURL=true){dialog.close();if(dialog.id==='detail-dialog'&&updateURL)syncLocation(null,true);const previous=dialogStack.pop();if(previous){previous.dialog.showModal();if(previous.focus?.isConnected)previous.focus.focus({preventScroll:true});}else if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
function closeAllDialogs(){dialogStack.length=0;$$('dialog[open]').forEach(d=>d.close());}
function detailShelf(title,list,note=''){return `<section class="detail-shelf"><h3>${E(title)}</h3>${note?`<p class="shelf-note">${E(note)}</p>`:''}${list.length?`<div class="related-grid">${list.slice(0,6).map(i=>card(i)).join('')}</div>`:'<p class="storage-note">현재 등록된 작품에서 확인할 수 있는 연결 정보가 없어요.</p>'}</section>`;}
function openDetail(id,updateURL=true){
  const item=byId.get(id);if(!item||item.adult===true){if(updateURL)notify('현재 표시할 수 없는 작품입니다.');return;}
  const links=item.platforms.filter(p=>safeURL(p.url)),screen=['영화','드라마','OTT','애니메이션'].includes(item.type),people=item.credits.filter(c=>screen?c.role==='DIRECTOR':['STORY_WRITER','LEAD_ARTIST','ORIGINAL_AUTHOR','ADAPTATION_WRITER'].includes(c.role));
  const same=sameCreatorWorks(item,items),candidates=sameNameCreatorCandidates(item,items),cast=item.credits.filter(c=>actorRoles.has(c.role));
  $('#detail-content').innerHTML=`<div class="detail-top"><div>${image(item,'detail-poster',true)||`<div class="detail-poster cover-fallback" style="position:relative">${E(item.title)}</div>`}</div><div class="detail-info"><div class="detail-type"><span>${E(item.type)}</span><span>·</span><span>${E(item.genre||'작품')}</span>${item.age!=null?`<span>·</span><span>${item.age===0?'전체 이용가':item.age+'세 이상'}</span>`:''}</div><h2 class="detail-title" id="detail-title">${E(item.title)}</h2><p class="detail-meta">${E(people.map(c=>c.roleLabel+' '+c.name).join(' · ')||item.creators.slice(0,3).join(' · '))}${item.year?'<br>'+item.year+'년 공개':''}</p><p class="detail-description">${E(item.description||'작품의 더 자세한 이야기는 공식 플랫폼에서 만나보세요.')}</p><div class="detail-actions">${links.length?`<a class="primary-button" href="${E(safeURL(links[0].url))}" target="_blank" rel="noopener noreferrer">공식 플랫폼에서 보기 ↗</a>`:''}<button class="outline-button detail-save" data-save="${id}" aria-pressed="${saved.has(id)}">${icon}${saved.has(id)?'보관한 작품':'보관하기'}</button></div></div></div><div class="detail-body"><div class="detail-tags">${item.tags.map(t=>`<button class="detail-tag" data-detail-tag="${E(t)}">#${E(t)}</button>`).join('')}</div><h3>어디서 볼 수 있나요?</h3><div class="platform-links">${links.map(p=>`<a class="platform-link" href="${E(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">${E(p.name)}<span>↗</span></a>`).join('')||'<p class="storage-note">공식 감상처를 확인하고 있어요.</p>'}</div><p class="availability-note">감상 가능 여부와 이용 요금은 각 플랫폼에서 확인해주세요.</p>${detailShelf('유사픽 · 이 이야기의 다음 장',similarPicks(item,items,profile,6),'장르·소재·인물 관계의 공통점에 현재 취향을 더했어요.')}${detailShelf(screen?'같은 감독의 작품':'같은 작가·제작진의 작품',same.map(r=>r.item),same.length?[...new Set(same.flatMap(r=>r.matches.map(c=>c.name)))].join(' · '):'확인된 인물 연결을 기준으로 표시합니다.')}${candidates.length?detailShelf(screen?'같은 이름의 감독으로 찾은 작품':'같은 이름의 작가로 찾은 작품',candidates.map(r=>r.item),'이름과 역할이 같은 작품입니다. 인물 정보가 확인되지 않아 동명이인이 포함될 수 있어요.'):''}${screen?`<section class="detail-shelf"><h3>출연배우</h3>${cast.length?`<div class="cast-grid">${cast.map(c=>`<button class="cast-person" data-cast="${E(c.name)}"><span class="cast-avatar">${E(c.name.slice(0,1))}</span><span><strong>${E(c.name)}</strong><small>${E(c.roleLabel)} · 출연작 보기 ↗</small></span></button>`).join('')}</div>`:'<p class="storage-note">등록된 출연진 정보가 없어요.</p>'}</section>`:''}</div>`;
  openDialog($('#detail-dialog'));updateSavedUI();if(updateURL)syncLocation(id);
}
function renderLibrary(){const list=[...saved].reverse().map(id=>byId.get(id)).filter(i=>i&&!i.adult);$('#library-grid').innerHTML=list.length?list.map(i=>card(i,{tags:true})).join(''):'<div class="empty-state"><h3>나만의 이야기를 모아보세요</h3><p>작품 표지의 책갈피를 누르면<br>여기에서 다시 만날 수 있어요.</p><button class="primary-button" data-action="browse-from-library">작품 둘러보기</button></div>';}
function showCriteria(section){const copy={hero:['오늘의 추천은 이렇게 골라요','현재 사용자의 선호 키워드와 많이 겹치는 작품부터 추천합니다. 표지가 있는 작품을 대상으로 같은 원작의 다른 매체가 반복되지 않도록 구성했어요.','지금은 임시 사용자 ‘액션파 독자’의 액션·무림·먼치킨·회귀 취향을 기본값으로 사용합니다. 취향을 바꾸면 추천도 달라져요.'],immersive:['몰입할 이야기는 이렇게 골라요','액션·무협·생존·스릴러·미스터리·복수극에 해당하는 작품을 먼저 모읍니다. 그 안에서 현재 사용자의 선호 키워드가 많이 일치하는 순서로 정렬해요.','완독률이나 조회수를 사용하는 순위는 아닙니다. 현재 제공된 작품 태그를 기준으로 추천합니다.'],discovery:['발견픽은 이렇게 넓혀줘요','취향이 일부 겹치는 작품 중에서 새로운 장르와 매체를 함께 고려합니다. 취향 일치 65%, 새로운 장르 20%, 주로 추천된 매체와 다른 매체 15%를 반영해요.','이미 취향순 상단에 자주 등장하는 후보는 제외하고, 첫 선택에서 같은 매체·대표 장르가 반복되지 않도록 조정합니다.']};const c=copy[section]||copy.hero;$('#criteria-title').textContent=c[0];$('#criteria-content').innerHTML=`<p>${E(c[1])}</p><p>${E(c[2])}</p><p class="storage-note">취향순 동점은 표지·소개 정보 유무, 작품 ID 순으로 정렬합니다. 개인 취향은 인기순위와 별개이며, 확률이나 실제 만족도로 표시하지 않습니다.</p>`;openDialog($('#criteria-dialog'));}
function refreshRecommendations(){heroPage=0;renderHero();renderShelves();visibleCount=12;renderBrowsing();if(visitContext)renderContext();if($('#library-dialog').open)renderLibrary();}
function applySearch(value){resetState();state.query=value.trim().slice(0,200);syncLocation();renderBrowsing(true);}
document.addEventListener('click',event=>{
  const b=event.target.closest('button,a');if(!b)return;
  if(b.dataset.work)return openDetail(Number(b.dataset.work));
  if(b.dataset.save)return toggleSaved(Number(b.dataset.save));
  if(b.dataset.media){state.types=b.dataset.media==='전체'?[]:[b.dataset.media];visibleCount=12;syncLocation();renderBrowsing();$(`[data-media="${b.dataset.media}"]`).focus({preventScroll:true});return;}
  if(b.dataset.tab){state.tab=b.dataset.tab;state.expanded=false;renderFilters();$(`[data-tab="${state.tab}"]`).focus();return;}
  if(b.dataset.facet)return changeFilter(b.dataset.facet,b.dataset.value);
  if(b.dataset.clear){const key=b.dataset.clear;if(['type','platform',...GROUPS.map(g=>g.id)].includes(key))return changeFilter(key,b.dataset.value);state[key]=key==='mode'?'all':'';visibleCount=12;syncLocation();return renderBrowsing();}
  if(b.dataset.popular){popularTab=b.dataset.popular;return renderPopular();}
  if(b.dataset.theme){closeAllDialogs();resetState();state.theme=b.dataset.theme;syncLocation();return renderBrowsing(true);}
  if(b.dataset.detailTag){const label=b.dataset.detailTag,g=taxonomy.groups.find(g=>g.tags.some(t=>t.label===label));closeAllDialogs();resetState();if(g){state.tags[g.id]=[label];state.tab=g.id;}else state.query=label;syncLocation();return renderBrowsing(true);}
  if(b.dataset.cast){closeAllDialogs();resetState();state.person=b.dataset.cast;syncLocation();return renderBrowsing(true);}
  switch(b.dataset.action){
    case 'hero-prev':{const pages=Math.max(1,Math.ceil(heroItems.length/heroPageSize()));heroPage=(heroPage+pages-1)%pages;renderHero();break;}
    case 'hero-next':heroPage++;renderHero();break;
    case 'curated-more':case 'discovery-more':resetState();state.mode=b.dataset.action==='discovery-more'?'discovery':'immersive';syncLocation();renderBrowsing(true);break;
    case 'reset':resetState();syncLocation();renderBrowsing();break;
    case 'facet-more':state.expanded=!state.expanded;renderFilters();$('#facet-more').focus();break;
    case 'load-more':{const previous=visibleCount;visibleCount+=12;renderResults();$$('#browse-grid .cover-button')[previous]?.focus({preventScroll:true});break;}
    case 'library':renderLibrary();openDialog($('#library-dialog'));break;
    case 'about':openDialog($('#about-dialog'));break;
    case 'profile':$('#preferred-tags').value=profile.preferredTags.join(', ');$('#profile-title').textContent=profile.temporary?`${profile.name}의 취향`:'나의 취향';openDialog($('#profile-dialog'));break;
    case 'criteria':showCriteria(b.dataset.section);break;
    case 'sample-profile':profile=activateSampleProfile(getStorage());closeDialog($('#profile-dialog'));refreshRecommendations();notify('액션·무림·먼치킨·회귀 취향을 적용했어요.');break;
    case 'close-dialog':closeDialog(b.closest('dialog'));break;
    case 'browse-from-library':closeDialog($('#library-dialog'));$('#discover').scrollIntoView({behavior:'instant'});break;
    case 'retry':loadCatalog();break;
  }
});
for(const [form,input]of [['search-form','search'],['catalog-search-form','catalog-search']]){$('#'+form).addEventListener('submit',e=>{e.preventDefault();applySearch($('#'+input).value);});$('#'+input).addEventListener('search',()=>{if(!$('#'+input).value&&state.query){state.query='';visibleCount=12;syncLocation();renderBrowsing();}});}
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;visibleCount=12;syncLocation();renderBrowsing();});
$('#facet-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=GROUPS.findIndex(g=>g.id===state.tab);state.tab=GROUPS[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3].id;state.expanded=false;renderFilters();$(`[data-tab="${state.tab}"]`).focus();});
$('#profile-form').addEventListener('submit',e=>{e.preventDefault();try{profile=saveProfile({id:'local-taste-reader',name:'나의 취향',temporary:false,preferredTags:$('#preferred-tags').value.split(',')},getStorage());closeDialog($('#profile-dialog'));refreshRecommendations();notify('바뀐 취향으로 추천을 정렬했어요.');}catch(error){notify(error.message);}});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){e.target.classList.add('failed');e.target.setAttribute('aria-hidden','true');if(!e.target.classList.contains('cover-image'))e.target.style.visibility='hidden';}},true);
$$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);}});d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});});
window.addEventListener('popstate',()=>{if(!items.length)return;readLocation();visibleCount=12;renderBrowsing();const id=Number(new URLSearchParams(location.search).get('work'));if(id)openDetail(id,false);else closeAllDialogs();});
window.addEventListener('storage',e=>{if(e.key===BOOKMARK_KEY){try{const value=JSON.parse(e.newValue||'[]');saved=new Set(Array.isArray(value)?value.filter(Number.isInteger):[]);updateSavedUI();if($('#library-dialog').open)renderLibrary();}catch{}}if(e.key===PROFILE_KEY){profile=loadProfile(getStorage());refreshRecommendations();}});
window.addEventListener('resize',()=>{const size=heroPageSize();if(items.length&&size!==renderedHeroPageSize){heroPage=Math.floor(heroPage*renderedHeroPageSize/size);renderHero();}});
async function loadCatalog(){if(catalogLoading)return;catalogLoading=true;catalogMeta=null;items=[];byId=new Map();results=[];visitContext=null;contextPromise=null;
  $('#results-count').textContent='최신 DB에서 전체 작품을 확인하고 있어요';$('#empty-state').hidden=true;$('#load-more').hidden=true;$('.context-card').hidden=true;
  for(const selector of ['#hero-grid','#curated-grid','#discovery-grid','#browse-grid','#facet-tabs','#facet-chips','#platform-chips','#popular-tabs','#side-picks','#popular-source'])$(selector).innerHTML='';
try{
  const fetchRankings=async()=>{try{const response=await fetch('/data/popular.json',{signal:AbortSignal.timeout(10000)});return response.ok?await response.json():{lists:[]};}catch{return {lists:[]};}};
  const [data,rankings]=await Promise.all([loadLiveCatalog({onProgress:({loaded,total})=>{$('#results-count').textContent=`최신 DB 확인 중 · ${format(loaded)} / ${format(total)}편`;}}),fetchRankings()]);
  items=data.items.map(item=>({...item,searchText:norm([item.title,...item.creators,...item.credits.map(credit=>credit.name),...item.tags,...item.contextTags.map(tag=>themeById(tag)?.label||tag),item.description].join(' '))}));byId=new Map(items.map(item=>[item.id,item]));taxonomy=data.taxonomy;popular=Array.isArray(rankings?.lists)?rankings:{lists:[]};catalogMeta=data.meta;
  readLocation();renderHero();renderShelves();renderBrowsing();renderPopular();void prepareContext();updateSavedUI();const id=Number(new URLSearchParams(location.search).get('work'));if(id)openDetail(id,false);
}catch(error){console.error('찰픽 최신 DB 작품 화면을 불러오지 못했습니다.',error);catalogMeta=null;items=[];byId=new Map();$('#hero-grid').innerHTML='';$('#results-count').textContent='최신 DB 연결을 확인하지 못했어요';$('#browse-grid').innerHTML='';$('#empty-state').hidden=false;$('#empty-state').innerHTML='<h3>최신 작품 목록을 불러오지 못했어요</h3><p>이전 자료로 대신 표시하지 않습니다.<br>잠시 후 다시 시도해주세요.</p><button class="primary-button" data-action="retry">다시 불러오기</button>';}finally{catalogLoading=false;}}
initAuth();loadCatalog();
