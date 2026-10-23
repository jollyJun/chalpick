import {themeById,matchesTheme} from './context.js';
export {THEMES,seoulParts,currentThemeIds,themeById,matchesTheme} from './context.js';
export const PROFILE_KEY='chalpick-main-taste-profile-v1';
export const SAMPLE_PROFILE=Object.freeze({id:'sample-martial-reader',name:'액션파 독자',temporary:true,preferredTags:['액션','무림','먼치킨','회귀'],excludedTags:[],version:1});
const aliases={'무림':['무림·문파','무협'],'로판':['판타지 로맨스'],'드라마':['휴먼 드라마'],'회귀':['회귀'],'먼치킨':['먼치킨'],'액션':['액션']};
const norm=value=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
export function matchesTag(item,term){const accepted=[term,...(aliases[term]||[])].map(norm);return (item.tags||[]).some(tag=>accepted.includes(norm(tag)));}
export function activateSampleProfile(storage=globalThis.localStorage){const profile={...SAMPLE_PROFILE,preferredTags:[...SAMPLE_PROFILE.preferredTags]};try{storage?.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{}return profile;}
export function loadProfile(storage=globalThis.localStorage){try{const value=JSON.parse(storage?.getItem(PROFILE_KEY)||'null');if(value&&Array.isArray(value.preferredTags)&&value.preferredTags.length)return {...value,preferredTags:value.preferredTags.filter(t=>typeof t==='string').slice(0,16),excludedTags:Array.isArray(value.excludedTags)?value.excludedTags:[]};}catch{}return activateSampleProfile(storage);}
export function saveProfile(profile,storage=globalThis.localStorage){const clean={id:profile.id||'local-taste-reader',name:String(profile.name||'나의 취향').slice(0,24),temporary:Boolean(profile.temporary),preferredTags:[...new Set(profile.preferredTags.map(t=>String(t).trim()).filter(Boolean))].slice(0,16),excludedTags:[],version:1};if(!clean.preferredTags.length)throw new Error('좋아하는 키워드를 하나 이상 입력해주세요.');storage?.setItem(PROFILE_KEY,JSON.stringify(clean));return clean;}
export function tasteMatch(item,profile){const terms=profile?.preferredTags||[];const matched=terms.filter(term=>matchesTag(item,term));return {score:terms.length?matched.length/terms.length:0,matched,total:terms.length};}
function quality(item){return Number(Boolean(item.image))*2+Number(Boolean(item.description));}
function tie(a,b){return quality(b)-quality(a)||Number(a.id)-Number(b.id);}
export function isEligible(item,profile){return item.adult!==true&&!(profile?.excludedTags||[]).some(tag=>matchesTag(item,tag));}
function tasteEvaluator(profile){
  const terms=profile?.preferredTags||[],normalized=new Map(),rules=new Map(),itemTags=new Map(),matches=new Map();
  const normalize=value=>{if(!normalized.has(value))normalized.set(value,norm(value));return normalized.get(value);};
  const rule=term=>{if(!rules.has(term))rules.set(term,[term,...(aliases[term]||[])].map(normalize));return rules.get(term);};
  const tagsFor=item=>{if(!itemTags.has(item))itemTags.set(item,new Set((item.tags||[]).map(normalize)));return itemTags.get(item);};
  const has=(item,term)=>rule(term).some(tag=>tagsFor(item).has(tag));
  const match=item=>{if(!matches.has(item)){const matched=terms.filter(term=>has(item,term));matches.set(item,{score:terms.length?matched.length/terms.length:0,matched,total:terms.length});}return matches.get(item);};
  return {match,eligible:item=>item.adult!==true&&!(profile?.excludedTags||[]).some(term=>has(item,term)),hasAny:(item,keywords)=>keywords.some(term=>has(item,term)),preferredTag:tag=>terms.some(term=>rule(term).includes(normalize(tag)))};
}
function tasteOrder(items,evaluator){return items.filter(item=>evaluator.eligible(item)).map(item=>({item,score:evaluator.match(item).score})).sort((left,right)=>right.score-left.score||tie(left.item,right.item)).map(row=>row.item);}
export function sortByTaste(items,profile){return tasteOrder(items,tasteEvaluator(profile));}
function similarity(a,b){const ga=a.tagGroups||{genre:[a.genre].filter(Boolean),setting:a.tags||[],relationship:[]};const gb=b.tagGroups||{genre:[b.genre].filter(Boolean),setting:b.tags||[],relationship:[]};let score=0;for(const [group,weight]of [['genre',.5],['setting',.3],['relationship',.2]]){const left=new Set(ga[group]||[]),right=new Set(gb[group]||[]),union=new Set([...left,...right]);const common=[...left].filter(tag=>right.has(tag)).length;if(union.size)score+=weight*common/union.size;}return score;}
export function similarPicks(seed,items,profile,limit=6){const evaluator=tasteEvaluator(profile);return items.filter(item=>item.id!==seed.id&&evaluator.eligible(item)).map(item=>({item,similarity:similarity(seed,item)})).filter(row=>row.similarity>0).map(row=>({...row,score:row.similarity*.8+evaluator.match(row.item).score*.2})).sort((left,right)=>right.score-left.score||tie(left.item,right.item)).slice(0,limit).map(row=>row.item);}
export function discoveryPicks(items,profile,limit=6){
  const evaluator=tasteEvaluator(profile),eligible=tasteOrder(items,evaluator);
  const familiarCount=Math.min(24,Math.max(1,Math.floor(eligible.length/3)));
  const familiar=eligible.slice(0,familiarCount), familiarIds=new Set(familiar.map(item=>item.id));
  const primaryType=familiar.reduce((map,item)=>map.set(item.type,(map.get(item.type)||0)+1),new Map());
  const dominant=[...primaryType].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const candidates=eligible.filter(item=>!familiarIds.has(item.id)).map(item=>{const match=evaluator.match(item);const novelGenre=!(item.tagGroups?.genre||[item.genre]).some(tag=>evaluator.preferredTag(tag));const novelType=item.type!==dominant;return{item,match,novelGenre,novelType,score:match.score*.65+(novelGenre?.2:0)+(novelType?.15:0)};}).filter(row=>row.match.score>0&&(row.match.matched.length<row.match.total||(row.match.total===1&&(row.novelGenre||row.novelType))));
  candidates.sort((a,b)=>b.score-a.score||tie(a.item,b.item));
  const chosen=[],typeCounts=new Map(),genreCounts=new Map();
  const pickDiverse=(strict)=>{for(const row of candidates){if(chosen.length>=limit)break;if(chosen.some(item=>item.id===row.item.id))continue;if(strict&&((typeCounts.get(row.item.type)||0)>=2||(genreCounts.get(row.item.genre)||0)>=2))continue;chosen.push(row.item);typeCounts.set(row.item.type,(typeCounts.get(row.item.type)||0)+1);genreCounts.set(row.item.genre,(genreCounts.get(row.item.genre)||0)+1);}};
  pickDiverse(true);pickDiverse(false);return chosen;
}
export function discoveryReason(item,profile){const match=tasteMatch(item,profile);const unfamiliar=(item.tagGroups?.genre||[item.genre]).find(tag=>!(profile.preferredTags||[]).some(term=>[term,...(aliases[term]||[])].map(norm).includes(norm(tag))));return `${match.matched.slice(0,2).join('·')||'관심 키워드'} → ${unfamiliar||item.type}`;}
export function immersivePicks(items,profile,limit=6){const evaluator=tasteEvaluator(profile),keywords=['액션','무협','생존','스릴러','미스터리','복수극'];return tasteOrder(items.filter(item=>evaluator.hasAny(item,keywords)),evaluator).slice(0,limit);}
export function themePicks(items,profile,id){return sortByTaste(items.filter(item=>matchesTheme(item,themeById(id))),profile);}
const screenTypes=new Set(['영화','드라마','OTT','애니메이션']);
const textTypes=new Set(['웹툰','웹소설']);
const directorRoles=new Set(['DIRECTOR']);
const authorRoles=new Set(['STORY_WRITER','LEAD_ARTIST','ORIGINAL_AUTHOR','ADAPTATION_WRITER']);
const noCreatorRoles=new Set();
function creatorRoles(item){return screenTypes.has(item.type)?directorRoles:textTypes.has(item.type)?authorRoles:noCreatorRoles;}
function creatorCredits(item){const roles=creatorRoles(item);return(item.credits||[]).filter(credit=>roles.has(credit.role)&&credit.identityConfidence!=='collective_account');}
export function sameCreatorWorks(seed,items){const roles=creatorRoles(seed),credits=creatorCredits(seed);return items.filter(item=>item.id!==seed.id&&item.adult!==true).map(item=>{const matches=creatorCredits(item).filter(other=>roles.has(other.role)&&credits.some(credit=>credit.identityKey&&credit.identityKey===other.identityKey));return{item,matches};}).filter(row=>row.matches.length).sort((a,b)=>b.matches.length-a.matches.length||tie(a.item,b.item));}
export function sameNameCreatorCandidates(seed,items){const unknown=creatorCredits(seed).filter(credit=>!credit.identityKey&&norm(credit.name));const confirmed=new Set(sameCreatorWorks(seed,items).map(row=>row.item.id));return items.filter(item=>item.id!==seed.id&&item.adult!==true&&!confirmed.has(item.id)).map(item=>({item,matches:creatorCredits(item).filter(other=>unknown.some(credit=>norm(credit.name)===norm(other.name)&&credit.role===other.role))})).filter(row=>row.matches.length).sort((a,b)=>b.matches.length-a.matches.length||tie(a.item,b.item));}
