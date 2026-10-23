import { matchesTag, tasteMatch, isEligible, themeById, matchesTheme } from '../public/recommendation.js';

const aliases={'무림':['무림·문파','무협'],'로판':['판타지 로맨스'],'드라마':['휴먼 드라마'],'회귀':['회귀'],'먼치킨':['먼치킨'],'액션':['액션']};
const norm=value=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
const quality=item=>Number(Boolean(item.image))*2+Number(Boolean(item.description));
const tie=(left,right)=>quality(right)-quality(left)||Number(left.id)-Number(right.id);

export function sortByTaste(items,profile){return items.filter(item=>isEligible(item,profile)).slice().sort((left,right)=>tasteMatch(right,profile).score-tasteMatch(left,profile).score||tie(left,right));}
function similarity(leftItem,rightItem){const leftGroups=leftItem.tagGroups||{genre:[leftItem.genre].filter(Boolean),setting:leftItem.tags||[],relationship:[]};const rightGroups=rightItem.tagGroups||{genre:[rightItem.genre].filter(Boolean),setting:rightItem.tags||[],relationship:[]};let score=0;for(const [group,weight]of [['genre',.5],['setting',.3],['relationship',.2]]){const left=new Set(leftGroups[group]||[]),right=new Set(rightGroups[group]||[]),union=new Set([...left,...right]);const common=[...left].filter(tag=>right.has(tag)).length;if(union.size)score+=weight*common/union.size;}return score;}
export function similarPicks(seed,items,profile,limit=6){return items.filter(item=>item.id!==seed.id&&isEligible(item,profile)).map(item=>({item,similarity:similarity(seed,item)})).filter(row=>row.similarity>0).sort((left,right)=>(right.similarity*.8+tasteMatch(right.item,profile).score*.2)-(left.similarity*.8+tasteMatch(left.item,profile).score*.2)||tie(left.item,right.item)).slice(0,limit).map(row=>row.item);}
export function discoveryPicks(items,profile,limit=6){
  const eligible=sortByTaste(items,profile);
  const familiarCount=Math.min(24,Math.max(1,Math.floor(eligible.length/3)));
  const familiar=eligible.slice(0,familiarCount),familiarIds=new Set(familiar.map(item=>item.id));
  const primaryType=familiar.reduce((map,item)=>map.set(item.type,(map.get(item.type)||0)+1),new Map());
  const dominant=[...primaryType].sort((left,right)=>right[1]-left[1])[0]?.[0];
  const candidates=eligible.filter(item=>!familiarIds.has(item.id)).map(item=>{const match=tasteMatch(item,profile);const novelGenre=!(item.tagGroups?.genre||[item.genre]).some(tag=>(profile?.preferredTags||[]).some(term=>[term,...(aliases[term]||[])].map(norm).includes(norm(tag))));const novelType=item.type!==dominant;return{item,match,novelGenre,novelType,score:match.score*.65+(novelGenre?.2:0)+(novelType?.15:0)};}).filter(row=>row.match.score>0&&(row.match.matched.length<row.match.total||(row.match.total===1&&(row.novelGenre||row.novelType))));
  candidates.sort((left,right)=>right.score-left.score||tie(left.item,right.item));
  const chosen=[],typeCounts=new Map(),genreCounts=new Map();
  const pickDiverse=strict=>{for(const row of candidates){if(chosen.length>=limit)break;if(chosen.some(item=>item.id===row.item.id))continue;if(strict&&((typeCounts.get(row.item.type)||0)>=2||(genreCounts.get(row.item.genre)||0)>=2))continue;chosen.push(row.item);typeCounts.set(row.item.type,(typeCounts.get(row.item.type)||0)+1);genreCounts.set(row.item.genre,(genreCounts.get(row.item.genre)||0)+1);}};
  pickDiverse(true);pickDiverse(false);return chosen;
}
export function immersivePicks(items,profile,limit=6){return sortByTaste(items.filter(item=>['액션','무협','생존','스릴러','미스터리','복수극'].some(tag=>matchesTag(item,tag))),profile).slice(0,limit);}
export function themePicks(items,profile,id){return sortByTaste(items.filter(item=>matchesTheme(item,themeById(id))),profile);}
