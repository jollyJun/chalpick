(function(global){
  'use strict';
  const AXES = [
    {field:'tempo',low:'axis:tempo-slow',high:'axis:tempo-fast',lowLabel:'천천히 쌓아가는 전개',highLabel:'빠르게 이어지는 전개'},
    {field:'mood',low:'axis:mood-light',high:'axis:mood-heavy',lowLabel:'가볍고 편안한 분위기',highLabel:'묵직하고 진지한 분위기'},
    {field:'resolve',low:'axis:resolve-linger',high:'axis:resolve-payoff',lowLabel:'쉽게 풀리지 않고 여운이 남는 이야기',highLabel:'문제가 풀리며 시원해지는 이야기'},
    {field:'unusual',low:'axis:world-familiar',high:'axis:world-unfamiliar',lowLabel:'현실에 가까운 배경',highLabel:'낯선 설정과 세계관'}
  ];
  const TAG_LABELS = {
    'overpowered':'압도적인 능력의 주인공','competent-lead':'능숙하게 문제를 푸는 주인공',
    'underdog':'불리한 처지에서 도전하는 주인공','mentor-student':'스승과 제자',
    'found-family':'혈연을 넘어 가족이 되는 관계','system-window':'상태창과 시스템 규칙',
    'couple-crisis':'엇갈린 연인·부부 관계','human-nonhuman':'인간과 비인간의 관계',
    'murim-world':'무림과 문파','fictional-world':'창작물 속 세계','antihero':'선악의 경계에 있는 주인공'
  };
  const ENGINE_LABELS = {
    'murim_growth':'무공을 익히고 실력을 키우는 이야기',
    'murim_power_struggle':'문파와 세력 사이의 경쟁',
    'hunter_growth':'던전 공략과 헌터 성장',
    'fantasy_growth':'판타지 능력을 키우는 이야기',
    'romance_formation':'마음이 이어지고 사랑을 선택하는 이야기',
    'couple_repair':'엇갈린 연인 관계를 풀어가는 이야기',
    'workplace_problem_solving':'직장에서 문제를 해결하는 이야기',
    'investigation_mystery':'단서를 따라 진실을 찾는 이야기',
    'game_progression':'게임을 플레이하고 공략하는 이야기',
    'personal_recovery':'자신의 삶을 다시 찾아가는 이야기',
    'political_power_struggle':'권력을 둘러싼 경쟁',
    'business_building':'사업이나 조직을 키우는 이야기',
    'everyday_comedy':'일상에서 벌어지는 유쾌한 소동'
  };
  const GENERIC = new Set(['modern','romance','action','fantasy','comedy','human-drama','youth','coming-of-age','secondary-world']);
  const SAFE_LIMIT=10;
  function create(works,options){
    works=Array.isArray(works)?works:[];options=options||{};
    const meta=options.meta||global.CHALPICK_META||{},tags=meta.tagDictionary||{},engines=meta.engineDictionary||{},engine=options.engine;
    const byId=new Map(works.map(w=>[String(w.id),w]));
    const axisByValue=new Map();
    AXES.forEach(a=>{axisByValue.set(a.low,{axis:a,direction:'low',label:a.lowLabel});axisByValue.set(a.high,{axis:a,direction:'high',label:a.highLabel});});
    function ipKey(w){
      if(engine&&typeof engine.ipKey==='function')return engine.ipKey(w);
      return w.ipId||String(w.title||w.id).toLowerCase().replace(/\s+/g,'').replace(/\((소설|웹소설|웹툰|드라마|영화|원작|ott)\)$/i,'');
    }
    const allByIP=new Map();works.forEach(w=>{if(!allByIP.has(ipKey(w)))allByIP.set(ipKey(w),new Set());(w.tagSlugs||[]).forEach(s=>allByIP.get(ipKey(w)).add(s));});
    const frequency=new Map();allByIP.forEach(set=>set.forEach(s=>frequency.set(s,(frequency.get(s)||0)+1)));
    function validTag(slug){return Object.prototype.hasOwnProperty.call(tags,slug)&&typeof tags[slug].label==='string'&&String(tags[slug].status||'').toUpperCase()!=='DEFERRED';}
    function validEngine(slug){return Object.prototype.hasOwnProperty.call(engines,slug)&&typeof engines[slug].label==='string'&&String(engines[slug].status||'').toUpperCase()!=='DEFERRED';}
    function tagLabel(slug){return TAG_LABELS[slug]||(tags[slug]&&tags[slug].label)||null;}
    function engineLabel(slug){return ENGINE_LABELS[slug]||(engines[slug]&&engines[slug].label)||null;}
    function known(value){
      if(typeof value!=='string')return null;
      if(axisByValue.has(value))return {value,label:axisByValue.get(value).label,evidence:[],kind:'axis',category:'axis'};
      if(value.startsWith('tag:')){
        const slug=value.slice(4);
        // Legacy explicit safety preference only. No supplied work has a gore
        // tag, so this value is never generated as a source-derived suggestion.
        if(slug==='gore')return {value,label:'잔혹한 장면',evidence:[],kind:'tag',category:'safety'};
        if(validTag(slug))return {value,label:tagLabel(slug),evidence:[],kind:'tag',category:tags[slug].category};
      }
      if(value.startsWith('engine:')){
        const slug=value.slice(7);
        if(validEngine(slug))return {value,label:engineLabel(slug),evidence:[],kind:'engine',category:'engine'};
      }
      return null;
    }
    function uniqueSources(ids){
      const found=new Map();
      ids.forEach(id=>{const w=byId.get(String(id));if(w&&!found.has(ipKey(w)))found.set(ipKey(w),w);});
      return [...found.values()];
    }
    function sources(state){
      const liked=Array.isArray(state.selected)?[...state.selected]:[],avoided=Array.isArray(state.disliked)?[...state.disliked]:[];
      Object.entries(state.feedback||{}).forEach(([id,f])=>{
        if(!f||typeof f!=='object')return;
        if(f.status==='liked')liked.push(id);
        if(f.status==='no'||f.status==='meh'||(f.status==='stopped'&&f.reason==='bored'))avoided.push(id);
      });
      return {liked:uniqueSources(liked),avoided:uniqueSources(avoided)};
    }
    function evidence(list){return [...new Set(list.map(w=>String(w.title||'')))].filter(Boolean).slice(0,3);}
    function grouped(list){
      const tag=new Map(),mechanism=new Map();
      list.forEach(w=>{
        [...new Set(w.tagSlugs||[])].filter(validTag).forEach(s=>{if(!tag.has(s))tag.set(s,[]);tag.get(s).push(w);});
        [...new Set([w.enginePrimary,w.engineSecondary])].filter(s=>s&&validEngine(s)).forEach(s=>{if(!mechanism.has(s))mechanism.set(s,[]);mechanism.get(s).push(w);});
      });
      return {tag,mechanism};
    }
    function structuralCandidates(list,other,negative){
      const groups=grouped(list),opposite=grouped(other),n=Math.max(1,list.length),otherN=Math.max(1,other.length),rows=[];
      groups.tag.forEach((support,slug)=>{
        const share=support.length/n,opposing=(opposite.tag.get(slug)||[]).length/otherN,contrast=negative?share-opposing:share;
        // A shared attribute can explain why a work was chosen, not why another
        // work was disliked. Even one positive example suppresses this automatic
        // negative suggestion; frequency differences do not justify the claim.
        if(negative&&opposite.tag.has(slug))return;
        const category=tags[slug].category,generic=GENERIC.has(slug),idf=Math.log(1+(allByIP.size+1)/((frequency.get(slug)||0)+1));
        rows.push({value:'tag:'+slug,label:tagLabel(slug),evidence:evidence(support),kind:'tag',category,broad:category==='genre'||generic,
          score:contrast*3+Math.min(1,support.length/3)*0.7+Math.min(3,idf)*0.14+(category==='genre'?-.35:.35)-(generic?1.1:0)});
      });
      groups.mechanism.forEach((support,slug)=>{
        const share=support.length/n,opposing=(opposite.mechanism.get(slug)||[]).length/otherN,contrast=negative?share-opposing:share;
        if(negative&&opposite.mechanism.has(slug))return;
        rows.push({value:'engine:'+slug,label:engineLabel(slug),evidence:evidence(support),kind:'engine',category:'engine',score:contrast*3+Math.min(1,support.length/3)*0.65+.25});
      });
      return rows;
    }
    function dominantAxes(list,opposite){
      const result=[];
      AXES.forEach(a=>{
        const available=list.filter(w=>Number.isFinite(w[a.field]));
        if(available.length<2)return;
        // A neutral band prevents a near-centre provisional score from being
        // presented as a clear preference. Missing values never count as zero.
        const low=available.filter(w=>w[a.field]<=40),high=available.filter(w=>w[a.field]>=65);
        const dominant=low.length/available.length>=.75?'low':high.length/available.length>=.75?'high':null;
        if(!dominant)return;
        const support=dominant==='low'?low:high;
        const direction=opposite?(dominant==='low'?'high':'low'):dominant;
        result.push({value:direction==='low'?a.low:a.high,label:direction==='low'?a.lowLabel:a.highLabel,
          evidence:evidence(support),kind:'axis',category:'axis',score:2.3+support.length/available.length*.6});
      });
      return result;
    }
    function select(candidates,current){
      const selected=[],used=new Set();
      // Preserve known, explicit choices first. The helper does not assign or
      // alter state; stale/arbitrary values are not turned into invented labels.
      (Array.isArray(current)?current:[]).forEach(value=>{
        const row=known(value);
        if(row&&!used.has(value)&&selected.length<SAFE_LIMIT){selected.push(row);used.add(value);}
      });
      const remaining=candidates.filter(r=>r.label&&!used.has(r.value));
      while(selected.length<SAFE_LIMIT&&remaining.length){
        const genreCount=selected.filter(r=>r.category==='genre').length,engineCount=selected.filter(r=>r.kind==='engine').length;
        let pool=remaining.filter(r=>(r.category!=='genre'||genreCount<2)&&(r.kind!=='engine'||engineCount<3));
        if(!pool.length)break;
        const specific=pool.filter(r=>!r.broad);if(specific.length)pool=specific;
        const adjusted=r=>r.score-selected.filter(x=>x.kind===r.kind).length*.17;
        pool.sort((a,b)=>adjusted(b)-adjusted(a)||a.value.localeCompare(b.value));
        const row=pool[0];selected.push(row);used.add(row.value);remaining.splice(remaining.indexOf(row),1);
      }
      return selected.map(({value,label,evidence,kind})=>({value,label,evidence,kind}));
    }
    function suggest(state){
      state=state||{};
      const source=sources(state);
      const likedCandidates=[...structuralCandidates(source.liked,source.avoided,false),...dominantAxes(source.liked,false)];
      let avoidedCandidates,avoidBasis,avoidHint;
      if(source.avoided.length){
        avoidedCandidates=structuralCandidates(source.avoided,source.liked,true);
        avoidBasis=avoidedCandidates.length?'disliked':'insufficient';
        if(!avoidedCandidates.length)avoidHint='별로였던 작품과 좋아한 작품에서 구별되는 요소를 찾지 못했어요.';
      }else{
        avoidedCandidates=dominantAxes(source.liked,true);
        avoidBasis=avoidedCandidates.length?'opposite':'insufficient';
      }
      const result={liked:select(likedCandidates,state.likedTags),avoided:select(avoidedCandidates,state.avoidedTags),avoidBasis};
      if(avoidHint)result.avoidHint=avoidHint;
      return result;
    }
    return Object.freeze({suggest});
  }
  global.CHALPICK_PREFERENCE_OPTIONS=Object.freeze({create,version:'20261013-source-contrast-v1'});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.CHALPICK_PREFERENCE_OPTIONS;
})(typeof window!=='undefined'?window:globalThis);
