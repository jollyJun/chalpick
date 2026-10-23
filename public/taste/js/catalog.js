/* Catalogue exploration, v14. Retrieval evidence is deliberately separate from final recommendation eligibility. */
(function(global){
  'use strict';
  const norm=value=>String(value||'').normalize('NFC').toLowerCase().replace(/\s+/g,'').replace(/[.,·:'"!?()\[\]{}\-:]/g,'');
  const titleKey=w=>norm(w.title.replace(/\s*\((웹소설|소설|웹툰|드라마|영화|ott|원작)\)\s*$/i,'').replace(/[:：]?\s*(시즌|season|파트|part)\s*\d+\s*$/i,'').replace(/\s+외전\s*$/,''));
  function create(works,meta,engine){
    works=Array.isArray(works)?works:[];meta=meta||{};
    const dict=meta.tagDictionary||{},byId=new Map(works.map(w=>[String(w.id),w])),descriptors=new WeakMap();
    const media=['영화','드라마','웹툰','웹소설'];
    const info=w=>{
      if(descriptors.has(w))return descriptors.get(w);
      const tags=Array.isArray(w.tagSlugs)?w.tagSlugs:[],genres=tags.filter(t=>dict[t]&&dict[t].category==='genre');
      const d={w,tags,tagSet:new Set(tags),genres,ip:engine.ipKey(w),title:titleKey(w),
        primary:w.enginePrimary||null,labels:tags.map(t=>dict[t]&&dict[t].label||t)};
      descriptors.set(w,d);return d;
    };
    works.forEach(info);
    const genreRows=Object.keys(dict).filter(key=>dict[key].category==='genre').map(key=>({key,label:dict[key].label,
      count:works.filter(w=>w.recommendationStatus!=='HOLD'&&info(w).tagSet.has(key)).length})).filter(row=>row.count>0).sort((a,b)=>a.label.localeCompare(b.label,'ko'));
    function pool(state){
      state=state||{};const mf=state.mediaFilters||[],gf=state.genreFilters||[];
      return works.filter(w=>w.recommendationStatus!=='HOLD'&&(!mf.length||mf.includes(w.media))&&(!gf.length||info(w).genres.some(g=>gf.includes(g))));
    }
    function sourceGenres(w){return w?Array.from(info(w).genres):[];}
    function sources(state){
      const out=[],seen=new Set();
      const add=w=>{if(!w)return;const d=info(w);if(seen.has(d.ip)||seen.has('title:'+d.title))return;seen.add(d.ip);seen.add('title:'+d.title);out.push(w);};
      (state.selected||[]).forEach(id=>add(byId.get(String(id))));
      Object.entries(state.feedback||{}).filter(([,f])=>f&&f.status==='liked').forEach(([id])=>add(byId.get(String(id))));
      return out;
    }
    function blocked(state){
      const ids=[...(state.selected||[]),...(state.disliked||[])];
      Object.entries(state.feedback||{}).forEach(([id,f])=>{if(f&&f.status!=='forgot')ids.push(id);});
      const keys=new Set();ids.map(id=>byId.get(String(id))).filter(Boolean).forEach(w=>{const d=info(w);keys.add(d.ip);keys.add('title:'+d.title);});
      return keys;
    }
    function retrieval(a,b){
      const A=info(a),B=info(b),sharedGenres=A.genres.filter(g=>B.tagSet.has(g)),shared=A.tags.filter(t=>B.tagSet.has(t));
      const specific=shared.filter(t=>!dict[t]||dict[t].category!=='genre');
      const genreScore=A.genres.length?sharedGenres.length/Math.max(A.genres.length,B.genres.length,1):0;
      const tagScore=shared.length/Math.max(1,new Set([...A.tags,...B.tags]).size);
      const sameEngine=!!(A.primary&&A.primary===B.primary);
      const relevant=sharedGenres.length>0||specific.length>=2||(sameEngine&&specific.length>=1);
      return {relevant,score:genreScore*0.42+tagScore*0.35+Math.min(0.15,specific.length*0.04)+(sameEngine?0.08:0),
        genres:sharedGenres,tags:specific,label:'같은 분야에서 찾아보기'};
    }
    function related(state,pivot,options){
      state=state||{};options=options||{};if(typeof pivot!=='object')pivot=byId.get(String(pivot));if(!pivot)return [];
      const limit=Math.max(0,Math.min(60,options.limit==null?6:options.limit)),blockedKeys=blocked(state),seen=new Set(),preferred=state.preferredMedia||[];
      const rows=works.filter(w=>w.recommendationStatus!=='HOLD'&&(!preferred.length||preferred.includes(w.media))).map(w=>{
        const d=info(w),p=retrieval(pivot,w),decision=engine.safetyDecision(w,state);
        return {work:w,p,decision,d};
      }).filter(row=>row.p.relevant&&!blockedKeys.has(row.d.ip)&&!blockedKeys.has('title:'+row.d.title)&&row.decision.status!=='blocked'&&!row.decision.missing.length)
        .sort((a,b)=>(b.p.score+engine.preferenceDetails(b.work,state).boost*0.4)-(a.p.score+engine.preferenceDetails(a.work,state).boost*0.4)||String(a.work.id).localeCompare(String(b.work.id)));
      const out=[];
      for(const row of rows){if(out.length>=limit)break;if(seen.has(row.d.ip)||seen.has('title:'+row.d.title))continue;seen.add(row.d.ip);seen.add('title:'+row.d.title);
        const labels=row.p.genres.map(g=>dict[g].label),tags=row.p.tags.map(g=>dict[g]&&dict[g].label||g);
        out.push({work:row.work,label:'같은 분야에서 찾아보기',isRecommendation:false,
          reason:labels.length?'등록된 '+labels.slice(0,2).join(' · ')+' 장르가 겹쳐요.':tags.slice(0,2).join(' · ')+' 요소가 등록돼 있어요.',
          sharedGenres:row.p.genres,sharedTags:tags,conditionNotice:row.decision.notice,sceneInfo:row.decision.sceneInfo});
      }
      return out;
    }
    function batch(state,options){
      state=state||{};options=options||{};const size=Math.max(1,Math.min(60,options.size||18)),rng=typeof options.rng==='function'?options.rng:Math.random;
      const shown=options.reset?{}:{...(state.shown||{})},shownIP=options.reset?{}:{...(state.shownIP||{})},round=options.reset?0:Number(state.round||0);
      if(!options.reset)Object.entries(shown).forEach(([id,count])=>{const w=byId.get(String(id));if(w){const d=info(w);shownIP[d.ip]=Math.max(shownIP[d.ip]||0,Number(count)||0);shownIP['title:'+d.title]=Math.max(shownIP['title:'+d.title]||0,Number(count)||0);}});
      const blockedKeys=blocked(state),src=sources(state),mode='balanced',learned=engine.learnedTags(state);
      const available=pool(state).filter(w=>{const d=info(w);return !blockedKeys.has(d.ip)&&!blockedKeys.has('title:'+d.title)&&!d.tags.some(tag=>learned.excluded.includes(tag));});
      const allUnique=new Set(available.map(w=>info(w).ip));
      const fresh=available.filter(w=>{const d=info(w);return !(shownIP[d.ip]>0)&&!(shownIP['title:'+d.title]>0);});
      const lastKeys=new Set((state.last||[]).map(id=>byId.get(String(id))).filter(Boolean).flatMap(w=>[info(w).ip,'title:'+info(w).title]));
      const repeated=fresh.length===0;
      const rotation=available.filter(w=>!lastKeys.has(info(w).ip)&&!lastKeys.has('title:'+info(w).title));
      const candidates=(fresh.length?fresh:rotation.length?rotation:available).map(w=>({w,d:info(w),noise:rng(),exposure:Math.max(shownIP[info(w).ip]||0,shownIP['title:'+info(w).title]||0)}));
      const clusters=new Map();src.forEach(w=>{const d=info(w),key=d.primary?'engine:'+d.primary:d.genres[0]?'genre:'+d.genres[0]:'tags:'+d.tags.slice(0,2).join('|');
        if(!clusters.has(key))clusters.set(key,[]);clusters.get(key).push(w);});
      const selectedCount=(state.selected||[]).length;
      const relatedTarget=!src.length||mode==='explore'?0:selectedCount<=2?(mode==='related'?Math.min(8,size):0):selectedCount<=5?Math.min(4,size):Math.min(6,size);
      const picked=[],roles=[],used=new Set(),mediaCounts=new Map(),genreCounts=new Map(),engineCounts=new Map(),clusterCounts=new Map();
      const add=(row,role)=>{picked.push(row.w);roles.push(role);used.add(row.d.ip);used.add('title:'+row.d.title);
        mediaCounts.set(row.w.media,(mediaCounts.get(row.w.media)||0)+1);row.d.genres.forEach(g=>genreCounts.set(g,(genreCounts.get(g)||0)+1));
        if(row.d.primary)engineCounts.set(row.d.primary,(engineCounts.get(row.d.primary)||0)+1);};
      const canPick=row=>!used.has(row.d.ip)&&!used.has('title:'+row.d.title);
      const diversity=row=>{
        let s=2.7/(1+(mediaCounts.get(row.w.media)||0));
        const g=row.d.genres.length?row.d.genres.reduce((sum,key)=>sum+2.3/(1+(genreCounts.get(key)||0)),0)/row.d.genres.length:0.8;
        s+=g;if(row.d.primary)s+=0.75/(1+(engineCounts.get(row.d.primary)||0));
        s+=row.noise*0.25-(repeated?row.exposure*8:0);return s;
      };
      candidates.forEach(row=>{
        row.connections=[...clusters.entries()].map(([key,sources])=>({key,p:sources.map(w=>retrieval(w,row.w)).sort((a,b)=>b.score-a.score)[0]})).filter(entry=>entry.p.relevant);
      });
      const firstBalanced=round===0&&selectedCount===0&&!(state.mediaFilters||[]).length&&!(state.genreFilters||[]).length&&mode==='balanced';
      if(firstBalanced){
        // The supplied tier is a catalogue ordering hint, not a claim about measured popularity.
        for(let slot=0;slot<Math.min(6,size);slot++){
          let best=null,bestValue=-Infinity;
          for(const row of candidates){if(!canPick(row)||!(row.w.tier==='T1'||row.w.tier===1))continue;
            const value=diversity(row);if(value>bestValue){bestValue=value;best=row;}
          }
          if(!best)break;add(best,'anchor');
        }
      }
      for(let slot=0;slot<relatedTarget;slot++){
        let best=null,bestValue=-Infinity;
        for(const row of candidates){if(!canPick(row)||!row.connections.length)continue;
          const connection=row.connections.map(c=>({...c,adjusted:c.p.score-(clusterCounts.get(c.key)||0)*0.26})).sort((a,b)=>b.adjusted-a.adjusted)[0];
          const score=connection.adjusted*4+diversity(row)*0.17+Math.min(0.4,row.d.tags.reduce((sum,t)=>sum+(learned.positive[t]>=2?Math.min(5,learned.positive[t]-1)*0.035:0),0));
          if(score>bestValue){bestValue=score;best={row,connection};}
        }
        if(!best)break;add(best.row,'related');clusterCounts.set(best.connection.key,(clusterCounts.get(best.connection.key)||0)+1);
      }
      while(picked.length<size){
        let best=null,bestValue=-Infinity;
        for(const row of candidates){if(!canPick(row))continue;
          const familiarity=row.connections.length?Math.max(...row.connections.map(c=>c.p.score)):0;
          const value=diversity(row)-(mode==='explore'||selectedCount<=2?familiarity*0.8:familiarity*0.25);
          if(value>bestValue){bestValue=value;best=row;}
        }
        if(!best)break;add(best,'explore');
      }
      // Interleave media for vertical reading without turning selected cells into replacement cells.
      const arranged=[],remaining=picked.map((w,i)=>({w,role:roles[i]}));
      while(remaining.length){const lastMedia=arranged.length?arranged[arranged.length-1].w.media:null;
        const at=Math.max(0,remaining.findIndex(row=>row.w.media!==lastMedia));arranged.push(remaining.splice(at,1)[0]);}
      arranged.forEach(row=>{shown[row.w.id]=(shown[row.w.id]||0)+1;const d=info(row.w);shownIP[d.ip]=(shownIP[d.ip]||0)+1;shownIP['title:'+d.title]=(shownIP['title:'+d.title]||0)+1;});
      let notice='다양한 장르에서 작품을 골라보세요.';
      if(!arranged.length)notice='현재 필터에서 새로 보여드릴 작품이 없어요. 장르나 매체 선택을 넓혀보세요.';
      else if(repeated)notice='현재 범위의 작품을 모두 살펴봤어요. 덜 본 작품부터 다시 보여드려요.';
      else if(arranged.length<size)notice='현재 범위에 남은 새로운 작품을 모두 보여드려요.';
      else if(relatedTarget)notice='좋아한 작품과 같은 분야도 함께 보여드려요.';
      const relatedCount=arranged.filter(row=>row.role==='related').length;
      return {ids:arranged.map(row=>row.w.id),roles:arranged.map(row=>row.role),notice,shown,shownIP,last:arranged.map(row=>row.w.id),round:round+1,
        stats:{size:arranged.length,relatedCount,exploreCount:arranged.length-relatedCount,targetRelated:relatedTarget,
          curatedPriorityCount:arranged.filter(row=>row.role==='anchor').length,pool:available.length,uniquePool:allUnique.size,remainingUnseen:new Set(fresh.map(w=>info(w).ip)).size,repeated,clusters:[...clusters.keys()]}};
    }
    function search(query,list,limit){
      list=Array.isArray(list)?list:works;limit=limit==null?240:Math.max(0,Math.min(500,limit));const raw=String(query||'').trim(),q=norm(raw);if(!q)return [];
      const terms=raw.split(/\s+/).map(norm).filter(Boolean),tokens=[q];if(raw.endsWith('물')&&raw.length>1)tokens.push(norm(raw.slice(0,-1)));
      const rows=list.map(w=>{
        const d=info(w),title=norm(w.title),tags=[...d.labels,...d.tags].map(norm),writers=(w.creators||[]).map(c=>norm(c.name)),platforms=(w.platforms||[]).map(norm);
        let score=0;
        tokens.forEach(token=>{if(title===token)score=Math.max(score,120);else if(title.startsWith(token))score=Math.max(score,112);else if(title.includes(token))score=Math.max(score,104);
          if(tags.some(tag=>tag===token))score=Math.max(score,94);else if(tags.some(tag=>tag.includes(token)))score=Math.max(score,86);
          if(writers.some(name=>name===token))score=Math.max(score,96);else if(writers.some(name=>name.includes(token)))score=Math.max(score,88);
          if(platforms.some(name=>name.includes(token)))score=Math.max(score,78);});
        if(!score&&terms.length>1){const fields=[title,...tags,...writers,...platforms];if(terms.every(term=>fields.some(field=>field.includes(term))))score=62;}
        return {w,score};
      }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.w.title.localeCompare(b.w.title,'ko')||String(a.w.id).localeCompare(String(b.w.id)));
      return rows.slice(0,limit).map(row=>row.w);
    }
    return Object.freeze({batch,pool,genres:()=>genreRows.map(row=>({...row})),sourceGenres,search,related,
      browseAffinity:(a,b)=>retrieval(a,b),version:'v16-20261015-catalog'});
  }
  global.ChalpickCatalog=Object.freeze({create,version:'v16-20261015-catalog'});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.ChalpickCatalog;
})(typeof window!=='undefined'?window:globalThis);

