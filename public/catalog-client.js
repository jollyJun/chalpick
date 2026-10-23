const GROUP_IDS=['genre','setting','relationship'];
const MEDIA_TYPES=new Set(['웹툰','웹소설','OTT','드라마','영화','애니메이션']);
const strings=value=>Array.isArray(value)?value.filter(entry=>typeof entry==='string'):[];
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const invalid=()=>new Error('최신 DB 작품 목록의 전체 수량을 확인하지 못했습니다.');

export function safePublicURL(value){
  if(typeof value!=='string')return '';
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

export function safeImageURL(value){
  return value==='/assets/adult-placeholder.svg'?value:safePublicURL(value);
}

export function normalizeCatalogItem(item){
  if(!item||!Number.isSafeInteger(item.id)||item.id<=0||typeof item.title!=='string'||!item.title.trim()||!MEDIA_TYPES.has(item.type))throw invalid();
  return {...item,adult:item.adult===true||(item.age!=null&&Number(item.age)>=18)?true:item.adult===false?false:null,creators:strings(item.creators),tags:strings(item.tags),contextTags:[...new Set(strings(item.contextTags))],platforms:(Array.isArray(item.platforms)?item.platforms:[]).filter(platform=>platform&&typeof platform.name==='string').map(platform=>({...platform,url:safePublicURL(platform.url)})),credits:(Array.isArray(item.credits)?item.credits:[]).filter(credit=>credit&&typeof credit.name==='string'),tagGroups:Object.fromEntries(GROUP_IDS.map(group=>[group,strings(item.tagGroups?.[group])])),image:safeImageURL(item.image)};
}

function normalizeTaxonomy(taxonomy){
  if(!taxonomy||!Array.isArray(taxonomy.groups)||GROUP_IDS.some(group=>!taxonomy.groups.some(entry=>entry.id===group&&Array.isArray(entry.tags))))throw invalid();
  return {...taxonomy,groups:taxonomy.groups.filter(group=>GROUP_IDS.includes(group.id)).map(group=>({...group,tags:group.tags.filter(tag=>tag&&typeof tag.label==='string')}))};
}

export async function loadLiveCatalog({fetchImpl=globalThis.fetch,onProgress=()=>{},signal}={}){
  const collected=[],seenIds=new Set();
  let offset=0,total=null,excluded=0,taxonomy=null,fetchedAt=null;
  do{
    const response=await fetchImpl(`/api/catalog?offset=${offset}`,{cache:'no-store',headers:{Accept:'application/json'},signal:signal||AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('최신 DB 작품 목록에 연결하지 못했습니다.');
    const page=await response.json(),meta=page?.meta;
    if(!Array.isArray(page?.items)||meta?.source!=='supabase'||!integer(meta.total)||meta.offset!==offset||!integer(meta.scanned)||!integer(meta.excluded)||!integer(meta.limit)||meta.limit===0||meta.scanned>meta.limit||page.items.length+meta.excluded!==meta.scanned)throw invalid();
    if(total===null){total=meta.total;taxonomy=normalizeTaxonomy(page.taxonomy);fetchedAt=meta.fetchedAt||null;}
    if(meta.total!==total||offset+meta.scanned>total)throw invalid();
    const nextOffset=offset+meta.scanned;
    if(meta.nextOffset!==null&&(!integer(meta.nextOffset)||meta.nextOffset!==nextOffset||nextOffset<=offset||nextOffset>=total))throw invalid();
    if(meta.nextOffset===null&&nextOffset!==total)throw invalid();
    excluded+=meta.excluded;
    for(const rawItem of page.items){
      const item=normalizeCatalogItem(rawItem);
      if(seenIds.has(item.id))throw invalid();
      seenIds.add(item.id);
      if(item.type==='애니메이션'){excluded++;continue;}
      collected.push(item);
    }
    onProgress({loaded:nextOffset,total});
    offset=meta.nextOffset;
  }while(offset!==null);
  if(collected.length+excluded!==total)throw invalid();
  const adultExcluded=collected.filter(item=>item.adult).length;
  taxonomy={...taxonomy,groups:taxonomy.groups.map(group=>{
    const counts=new Map(),countsAll=new Map();
    for(const item of collected)for(const label of new Set(item.tagGroups[group.id])){
      countsAll.set(label,(countsAll.get(label)||0)+1);
      if(item.adult!==true)counts.set(label,(counts.get(label)||0)+1);
    }
    return {...group,tags:group.tags.map(tag=>({...tag,count:counts.get(tag.label)||0,countAll:countsAll.get(tag.label)||0}))};
  })};
  return {items:collected,taxonomy,meta:{source:'supabase',total,loaded:collected.length,excluded,adultExcluded,available:collected.length-adultExcluded,fetchedAt}};
}

export function catalogCountLabel(meta){
  const format=value=>value.toLocaleString('ko-KR');
  return `DB 공개 대상 ${format(meta.total)}편 · 탐색 ${format(meta.available)}편 · 성인 제외 ${format(meta.adultExcluded)}편${meta.excluded?` · 기타 공개 제외 ${format(meta.excluded)}편`:''}`;
}
