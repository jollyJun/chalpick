/* Chalpick recommendation engine, upgraded 2026-10-15.
 * Pure functions over the supplied catalogue; no API requests and no inferred scene-safety claims.
 * The workbook's AI classifications remain provisional even when a work's identity is verified.
 */
(function (global) {
  'use strict';
  const AXES = ['tempo', 'mood', 'resolve', 'unusual'];
  const AXIS_WEIGHTS = {tempo:0.29, mood:0.25, resolve:0.22, unusual:0.24};
  const BROAD = new Set(['romance','romcom','romance-fantasy','fantasy','urban-fantasy','action','thriller','mystery','coming-of-age','youth','slice-of-life','comedy','human-drama','sf','period','modern','secondary-world']);
  const WORLD_TAGS = new Set(['murim-world','modern','joseon','medieval-west','modern-history','secondary-world','space','school','university','academy','office','palace','countryside','hospital','military']);
  const ENGINE_LABELS = {
    monster_disaster:'괴수 재난 대응',hunter_growth:'헌터 성장·공략',murim_growth:'무공 수련·성장',murim_power_struggle:'무림 세력 경쟁',
    revenge_progression:'복수 계획·응징',extraordinary_conflict:'초상 존재·능력 대결',romance_formation:'연애 형성·선택',family_healing:'가족·공동체 돌봄',
    workplace_problem_solving:'현장 업무 해결',investigation_mystery:'단서 추적·진실 규명',survival_strategy:'생존 전략·탈출',death_game:'생사를 건 규칙 경쟁',
    political_power_struggle:'권력 획득·유지',war_campaign:'전쟁·전역 수행',sports_competition:'훈련·실력 경쟁',medical_cases:'진단·치료',
    courtroom_cases:'법적 분쟁 해결',creative_achievement:'예술·창작 성취',school_relationship:'학교 관계·성숙',journey_quest:'탐색 여정·목표 수행',
    fantasy_growth:'판타지 능력 성장',game_progression:'게임 플레이·공략',couple_repair:'연인·부부 관계 재조정',romance_negotiation:'계약·신분 속 연애 협상',
    crime_enterprise:'범죄 세계의 흥망',heist_operation:'범행 계획·실행',covert_operation:'위장·잠입 임무',protection_rescue:'구출·호위',
    business_building:'사업·조직 구축',everyday_comedy:'생활 속 소동',personal_recovery:'자립·삶의 재정립',social_resistance:'부조리 저항·권리 회복',
    anomaly_consequence:'기이한 규칙·선택의 대가',school_power_struggle:'학교 서열·저항',family_conflict:'가족의 비밀·책임 충돌'
  };
  const WORLD_LABELS = {realistic_modern:'현실적인 현대',historical_realistic:'현실적인 역사·시대',alternate_reality:'현실을 변형한 세계',
    modern_intrusion:'현대에 비일상 요소가 들어온 세계',modern_single_intrusion:'하나의 비일상 전제가 있는 현대',modern_supernatural_system:'초상 규칙이 일상화된 현대',
    secondary_fantasy_world:'별개의 판타지 세계',science_fiction_world:'과학 기술을 바탕으로 한 비일상 세계'};
  const AXIS_PREFERENCES = {
    'tempo-fast':{field:'tempo',direction:1,label:'빠른 전개'},'tempo-slow':{field:'tempo',direction:-1,label:'느긋한 전개'},
    'mood-light':{field:'mood',direction:-1,label:'가벼운 분위기'},'mood-heavy':{field:'mood',direction:1,label:'묵직한 분위기'},
    'resolve-payoff':{field:'resolve',direction:1,label:'갈등이 풀리는 감각'},'resolve-linger':{field:'resolve',direction:-1,label:'여운 있는 전개'},
    'world-familiar':{field:'unusual',direction:-1,label:'익숙한 배경'},'world-unfamiliar':{field:'unusual',direction:1,label:'낯선 설정'}
  };
  const ENGINE_BRIDGES = [
    ['romance_formation','couple_repair','연애 감정과 관계의 선택'],
    ['romance_formation','romance_negotiation','연애 관계의 선택과 조건 조율'],
    ['couple_repair','romance_negotiation','관계의 유지와 조건 조율'],
    ['murim_growth','murim_power_struggle','강호에서 실력과 세력의 위상을 바꾸는 과정'],
    ['hunter_growth','fantasy_growth','능력을 키우며 강적을 공략하는 과정'],
    ['hunter_growth','game_progression','공략과 보상으로 능력을 키우는 과정'],
    ['fantasy_growth','game_progression','세계의 규칙을 공략하며 능력을 키우는 과정'],
    ['workplace_problem_solving','business_building','사람과 자원을 모아 조직의 문제를 해결하는 과정'],
    ['investigation_mystery','courtroom_cases','증거를 통해 사건의 진실과 책임을 밝히는 과정'],
    ['survival_strategy','death_game','위험의 규칙을 읽고 살아남는 선택'],
    ['heist_operation','covert_operation','계획과 위장을 실행하며 발각 위험을 관리하는 과정'],
    ['crime_enterprise','heist_operation','범죄 세계에서 계획을 실행하며 이익을 다투는 과정'],
    ['personal_recovery','family_healing','상처를 돌보고 삶을 다시 이어가는 과정'],
    ['school_relationship','personal_recovery','관계 속에서 자기 삶의 방향을 찾는 과정'],
    ['creative_achievement','personal_recovery','자기 삶의 방향을 선택하고 성취를 이어가는 과정'],
    ['revenge_progression','social_resistance','불의에 대응하며 존엄과 권리를 되찾는 과정'],
    ['monster_disaster','protection_rescue','위협 속에서 보호 대상의 안전을 확보하는 과정'],
    ['extraordinary_conflict','protection_rescue','비일상적 위협에 맞서 누군가를 보호하는 과정']
  ];
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const clamp = x => Math.max(0, Math.min(1, x));
  function normalize(s) { return String(s || '').toLowerCase().replace(/\s+/g,'').replace(/[.,·:'"!?()\[\]{}\-]/g,''); }
  function titleKey(w) {
    return normalize(String(typeof w === 'string' ? w : w.title || '')
      .replace(/\s*\((웹소설|소설|웹툰|드라마|영화|ott|원작)\)\s*$/i,'')
      .replace(/[:：]?\s*(시즌|season|파트|part)\s*\d+\s*$/i,'')
      .replace(/\s+외전\s*$/i,''));
  }
  function asArray(value) {
    if(Array.isArray(value)) return value;
    if(typeof value === 'string') { try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; } catch(_) { return []; } }
    return [];
  }
  function create(catalog, options) {
    options = options || {};
    const meta = options.meta || global.CHALPICK_META || {};
    const nowYear = options.nowYear || new Date().getFullYear();
    const works = Array.isArray(catalog) ? catalog : [];
    const byId = new Map(works.map(w=>[String(w.id),w]));
    const profiles = new WeakMap();
    const pairCache = new Map();
    const tagDictionary = meta.tagDictionary || {};
    const labelEngine = slug => (meta.engineDictionary && meta.engineDictionary[slug] && meta.engineDictionary[slug].label) || ENGINE_LABELS[slug] || slug || '진행 방식 미확인';
    const labelTag = slug => (tagDictionary[slug] && tagDictionary[slug].label) || slug;
    const labelWorld = slug => (meta.worldLabels && meta.worldLabels[slug]) || WORLD_LABELS[slug] || '배경 정보 미확인';
    const df = new Map();
    works.forEach(w=>new Set(asArray(w.tagSlugs || w.tag_slugs)).forEach(t=>df.set(t,(df.get(t)||0)+1)));
    // Corpus frequency reduces broad/common tags; it does not establish narrative compatibility.
    const idf = t => Math.min(3.2,Math.max(0.65,Math.log((works.length+1)/((df.get(t)||0)+1))+1));
    function preferenceItems(values) {
      const out=[],seen=new Set();
      (Array.isArray(values)?values:[]).forEach(raw=>{
        if(typeof raw!=='string')return;
        let kind,value;const index=raw.indexOf(':');
        if(index>=0){kind=raw.slice(0,index);value=raw.slice(index+1);}
        else if(tagDictionary[raw]||df.has(raw)||raw==='gore'||raw==='horror'){kind='tag';value=raw;}
        else if(ENGINE_LABELS[raw]||(meta.engineDictionary&&meta.engineDictionary[raw])){kind='engine';value=raw;}
        else if(AXIS_PREFERENCES[raw]){kind='axis';value=raw;}
        const valid=kind==='tag'&&(tagDictionary[value]||df.has(value)||value==='gore'||value==='horror')
          ||kind==='engine'&&(ENGINE_LABELS[value]||(meta.engineDictionary&&meta.engineDictionary[value]))
          ||kind==='axis'&&AXIS_PREFERENCES[value];
        const key=kind+':'+value;if(!valid||seen.has(key))return;seen.add(key);
        out.push({kind,value,key,label:kind==='tag'?value==='gore'?'잔혹 표현':labelTag(value):kind==='engine'?labelEngine(value):AXIS_PREFERENCES[value].label});
      });
      return out;
    }
    function preferenceEvidence(w,item) {
      const i=info(w);
      if(item.kind==='tag')return i.tagSet.has(item.value)?1:0;
      if(item.kind==='engine')return i.primary===item.value?1:i.secondary===item.value?0.55:0;
      const axis=AXIS_PREFERENCES[item.value];
      if(!axis||!finite(w[axis.field]))return 0;
      return Math.max(0,Math.min(1,(w[axis.field]-50)/40*axis.direction));
    }
    function preferenceDetails(w,state) {
      state=state||{};
      const avoided=preferenceItems(state.avoidedTags),avoidKeys=new Set(avoided.map(x=>x.key));
      const liked=preferenceItems(state.likedTags).filter(x=>!avoidKeys.has(x.key));
      const positive=liked.map(item=>({...item,match:preferenceEvidence(w,item)})).filter(item=>item.match>0);
      const negative=avoided.filter(item=>item.kind!=='tag').map(item=>({...item,match:preferenceEvidence(w,item)})).filter(item=>item.match>0);
      const pos=positive.reduce((sum,item)=>sum+item.match*(item.kind==='tag'?(BROAD.has(item.value)?0.018:0.045):item.kind==='engine'?0.06:0.035),0);
      const neg=negative.reduce((sum,item)=>sum+item.match*(item.kind==='engine'?0.075:0.04),0);
      return {boost:Math.min(0.12,pos)-Math.min(0.12,neg),matchedLikes:positive,matchedAvoidances:negative};
    }
    function ipKey(w) { return w && (w.ipId || w.ip_id) ? 'ip:'+String(w.ipId || w.ip_id) : 'title:'+titleKey(w); }
    function isSameIP(a,b) { return ipKey(a)===ipKey(b) || titleKey(a)===titleKey(b); }
    function quality(w) {
      const ds = w.dataStatus || {};
      const rec = w.recommendationStatus || w.recommendation_status || 'LIMITED';
      // Complexity-analysis status is not a verification status for a story engine or for an ending.
      const state = (w.enginePrimary || w.story_engine_primary) && (w.worldModel || w.world_model) ? 'PROVISIONAL' : 'INSUFFICIENT';
      const identity = ds.identity === 'verified' ? 1 : ds.identity === 'partial' ? 0.93 : 0.86;
      const structural = state === 'INSUFFICIENT' ? 0.69 : 0.91;
      const statusWeight = rec === 'ACTIVE' ? 1 : rec === 'HOLD' ? 0 : 0.91;
      return {weight:identity*structural*statusWeight,rec,state,identity:ds.identity || 'unknown',
        label:rec==='HOLD'?'검토 보류':state==='INSUFFICIENT'?'분류 근거 보완 필요':rec==='LIMITED'?'공개 자료 기반 · 일부 정보 보완 중':'공개 자료 기반 잠정 분류'};
    }
    function info(w) {
      if(profiles.has(w)) return profiles.get(w);
      const tags=asArray(w.tagSlugs || w.tag_slugs);
      const primary=w.enginePrimary || w.story_engine_primary || null;
      const secondary=w.engineSecondary || w.story_engine_secondary || null;
      const world=w.worldModel || w.world_model || null;
      const fantasy=w.fantasyPresence || w.fantasy_presence || null;
      const map=new Map();
      tags.forEach(t=>map.set(t,idf(t)*(BROAD.has(t)?0.26:1)));
      const ctx=tags.filter(t=>!BROAD.has(t) && !WORLD_TAGS.has(t) && (!tagDictionary[t] || tagDictionary[t].category!=='genre'));
      const p={w,tags,tagSet:new Set(tags),map,context:new Set(ctx),primary,secondary,world,fantasy,quality:quality(w)};
      profiles.set(w,p); return p;
    }
    function tagSimilarity(a,b) {
      const keys=new Set([...a.map.keys(),...b.map.keys()]); let n=0,d=0;
      keys.forEach(t=>{n+=Math.min(a.map.get(t)||0,b.map.get(t)||0);d+=Math.max(a.map.get(t)||0,b.map.get(t)||0);});
      return d?n/d:0;
    }
    function axisSimilarity(a,b) {
      let distance=0, weight=0, count=0;
      AXES.forEach(k=>{if(finite(a[k])&&finite(b[k])){distance+=AXIS_WEIGHTS[k]*Math.pow((a[k]-b[k])/100,2);weight+=AXIS_WEIGHTS[k];count++;}});
      return {score:weight?clamp(1-Math.sqrt(distance/weight)):0.5,count};
    }
    function worldCompatibility(a,b) {
      if(!a.world || !b.world) return 0;
      if(a.world===b.world) return 1;
      const modern=new Set(['realistic_modern','modern_intrusion','modern_single_intrusion','modern_supernatural_system']);
      const am=modern.has(a.world),bm=modern.has(b.world);
      if(am&&bm) return a.world==='realistic_modern'||b.world==='realistic_modern'?0.67:0.84;
      if((a.world==='alternate_reality'&&b.world==='secondary_fantasy_world')||(b.world==='alternate_reality'&&a.world==='secondary_fantasy_world')){
        return a.tagSet.has('murim-world')&&b.tagSet.has('murim-world')?0.83:0.55;
      }
      if(a.world==='historical_realistic'&&b.world==='realistic_modern'||b.world==='historical_realistic'&&a.world==='realistic_modern') return 0.52;
      return 0.25;
    }
    function engineConnection(a,b) {
      if(a.primary && a.primary===b.primary) return {strength:1,slug:a.primary,kind:'primary',text:labelEngine(a.primary)};
      if(a.primary && a.primary===b.secondary) return {strength:0.78,slug:a.primary,kind:'secondary',text:labelEngine(a.primary)};
      if(a.secondary && a.secondary===b.primary) return {strength:0.78,slug:b.primary,kind:'secondary',text:labelEngine(b.primary)};
      if(a.secondary && a.secondary===b.secondary) return {strength:0.48,slug:a.secondary,kind:'secondary-only',text:labelEngine(a.secondary)};
      const bridge=ENGINE_BRIDGES.find(row=>row[0]===a.primary&&row[1]===b.primary||row[1]===a.primary&&row[0]===b.primary);
      return bridge?{strength:0.58,kind:'adjacent',text:bridge[2]}:{strength:0,kind:'none',text:''};
    }
    function contradictions(a,b) {
      const all=[],hard=[],soft=[],details=[];
      const verified=(w,key)=>{
        const value=w.axisConfidenceByField&&w.axisConfidenceByField[key];
        const status=typeof value==='string'?value:value&&value.status;
        const proof=value&&typeof value==='object'?(value.sources||value.evidence||value.source):w.axisEvidenceByField&&w.axisEvidenceByField[key];
        const hasProof=Array.isArray(proof)?proof.some(item=>typeof item==='string'&&item.trim()):typeof proof==='string'&&!!proof.trim();
        // The workbook-wide legacy label is not current field-level human verification.
        return (status==='확정'||status==='verified')&&hasProof;
      };
      const addAxis=(key,threshold,text)=>{
        if(!finite(a[key])||!finite(b[key])||Math.abs(a[key]-b[key])<threshold)return;
        const trusted=verified(a,key)&&verified(b,key);all.push(text);(trusted?hard:soft).push(text);
        details.push({field:key,sourceValue:a[key],candidateValue:b[key],verified:trusted,text});
      };
      addAxis('tempo',30,'전개 속도의 차이가 커요');
      addAxis('resolve',33,'갈등이 풀리는 감각의 차이가 커요');
      addAxis('mood',38,'이야기의 무게감 차이가 커요');
      const A=info(a),B=info(b);
      if(A.tagSet.has('overpowered')&&!A.tagSet.has('underdog')&&B.tagSet.has('underdog')&&!B.tagSet.has('overpowered')
        ||B.tagSet.has('overpowered')&&!B.tagSet.has('underdog')&&A.tagSet.has('underdog')&&!A.tagSet.has('overpowered')){
          const text='압도적인 실력과 약자의 도전이라는 출발점이 달라요';all.push(text);hard.push(text);
      }
      return {all,hard,soft,details};
    }
    function creatorOverlap(a,b) {
      const roles=new Set(['original_author','story_writer','screenwriter']);
      const writers=w=>(w.creators||[]).filter(c=>c.status==='verified'&&roles.has(c.role)&&c.name);
      const A=writers(a),B=writers(b);
      return [...new Set(A.filter(c=>B.some(d=>c.name===d.name&&c.role===d.role)).map(c=>c.name))];
    }
    function domainCompatible(A,B) {
      const hasMurim=i=>i.tagSet.has('murim')||i.tagSet.has('murim-world');
      const hasRomance=i=>['romance','romcom','romance-fantasy'].some(t=>i.tagSet.has(t));
      const schoolViolence=i=>i.tagSet.has('school')&&i.tagSet.has('school-bullying');
      return hasMurim(A)===hasMurim(B)&&hasRomance(A)===hasRomance(B)&&schoolViolence(A)===schoolViolence(B);
    }
    function pair(a,b) {
      if(typeof a!=='object') a=byId.get(String(a)); if(typeof b!=='object') b=byId.get(String(b));
      if(!a || !b) return {score:0,similar:false,discover:false,reject:['작품 정보 없음'],sharedTags:[],contextTags:[]};
      const cacheKey=String(a.id)+'|'+String(b.id);
      if(pairCache.has(cacheKey)) return pairCache.get(cacheKey);
      const A=info(a),B=info(b),connection=engineConnection(A,B);
      const shared=A.tags.filter(t=>B.tagSet.has(t));
      const context=shared.filter(t=>A.context.has(t)&&B.context.has(t));
      // A shared, explicitly recorded secondary engine narrows the main action loop.
      // Genre, world labels and numerical taste axes never stand in for this extra context.
      const sharedSecondary=A.primary&&A.primary===B.primary&&A.secondary&&A.secondary===B.secondary&&A.secondary!==A.primary?A.secondary:null;
      const contextCount=context.length+(sharedSecondary?1:0);
      const tag=tagSimilarity(A,B),world=worldCompatibility(A,B),axis=axisSimilarity(a,b);
      const conflicts=contradictions(a,b);
      const sameIP=isSameIP(a,b);
      const structureComplete=!!(A.primary&&B.primary&&A.world&&B.world);
      const fantasy=A.fantasy&&B.fantasy?(A.fantasy===B.fantasy?1:0.45):0.5;
      const trust=Math.sqrt(A.quality.weight*B.quality.weight);
      const commonCreators=creatorOverlap(a,b);
      const raw=connection.strength*0.40+world*0.20+tag*0.25+axis.score*0.10+fantasy*0.05+(commonCreators.length?0.025:0);
      const qualificationScore=clamp(raw*trust-Math.min(0.18,conflicts.hard.length*0.07));
      const score=clamp(qualificationScore-Math.min(0.09,conflicts.soft.length*0.025));
      // A secondary theme can support a match, but cannot replace the source's main reading experience.
      const secondaryEnough=connection.kind==='secondary'&&contextCount>=1&&tag>=0.13;
      const narrativeEnough=connection.kind==='primary'||secondaryEnough;
      const contextEnough=contextCount>=1;
      const compatible=domainCompatible(A,B);
      const similar=compatible&&structureComplete&&!sameIP&&narrativeEnough&&contextEnough&&world>=0.72&&conflicts.hard.length===0&&qualificationScore>=0.54;
      const primaryChanged=A.primary!==B.primary;
      const novelty=primaryChanged||A.world!==B.world||a.media!==b.media;
      const bridgeEnough=(connection.kind==='primary'&&contextEnough)
        ||(connection.kind==='secondary'&&contextCount>=1)
        ||(connection.kind==='adjacent'&&contextCount>=1)
        ||(connection.kind==='secondary-only'&&contextCount>=2);
      // "Growth" / "comedy" overlap never creates a bridge without a concrete action loop and context.
      const discover=structureComplete&&!sameIP&&novelty&&bridgeEnough&&qualificationScore>=0.39;
      const reject=[];
      if(!compatible) reject.push('무협·연애·학교폭력의 핵심 맥락이 다름');
      if(sameIP) reject.push('같은 원작·시리즈');
      if(!structureComplete) reject.push('주된 진행 방식 또는 배경 정보 미확인');
      if(!narrativeEnough) reject.push('주된 진행 방식이 다름');
      if(!contextEnough) reject.push('구체적인 서사 맥락 연결 부족');
      if(A.world&&B.world&&world<0.72) reject.push('배경·세계 규칙의 차이가 큼');
      if(qualificationScore<0.54)reject.push('구체적 유사성을 뒷받침하는 점수 근거 부족');
      reject.push(...conflicts.hard);
      const result={score,qualificationScore,softAxisPenalty:qualificationScore-score,rawScore:raw,similar,discover,sameIP,structureComplete,connection,worldScore:world,tagScore:tag,axisScore:axis.score,axisCount:axis.count,
        sharedTags:shared.map(labelTag),sharedSlugs:shared,contextTags:[...context.map(labelTag),...(sharedSecondary?[labelEngine(sharedSecondary)]:[])],
        contextSlugs:[...context,...(sharedSecondary?['engine:'+sharedSecondary]:[])],sharedSecondary,contradictions:conflicts.all,hardConflicts:conflicts.hard,
        axisDifferences:conflicts.details,reject,
        commonCreators,qualityWeight:trust,source:a,work:b};
      pairCache.set(cacheKey,result);
      // Bounded cache holds many sessions' useful pairs without growing across an endless local test.
      if(pairCache.size>60000) pairCache.clear();
      return result;
    }
    // Tier 2 uses recorded, specific connections; missing fields remain missing.
    function fallbackPair(a,b) {
      const p=pair(a,b),A=info(a),B=info(b);
      if(p.similar||isSameIP(a,b)||p.hardConflicts.length||!domainCompatible(A,B))return null;
      // A missing world must not turn a martial-arts pivot into a modern revenge pick.
      const murim=i=>i.tagSet.has('murim')||i.tagSet.has('murim-world');
      if(murim(A)!==murim(B))return null;
      const romance=i=>['romance','romcom','romance-fantasy'].some(t=>i.tagSet.has(t));
      if(romance(A)!==romance(B))return null;
      const domains=A.tags.filter(t=>B.tagSet.has(t)&&!BROAD.has(t)&&tagDictionary[t]?.category==='genre');
      // Inside a shared martial-arts domain, a narrower genre such as revenge is
      // contextual evidence too; it cannot connect martial arts to modern crime.
      const contexts=[...new Set([...A.context].filter(t=>B.context.has(t)).concat(murim(A)?domains.filter(t=>t!=='murim'):[]))];
      const world=worldCompatibility(A,B);
      const schoolContext=['action','school','school-bullying'].every(t=>A.tagSet.has(t)&&B.tagSet.has(t));
      const grounded=new Set(['realistic_modern','alternate_reality']);
      const schoolBridge=schoolContext&&grounded.has(A.world)&&grounded.has(B.world);
      if(A.world&&B.world&&world<0.55&&!schoolBridge)return null;
      const sameEngine=!!A.primary&&A.primary===B.primary;
      // Broad action/fantasy/growth/comedy never qualifies by itself.
      const domainContext=domains.length>0&&contexts.length>0;
      const domainStructure=domains.length>0&&sameEngine&&world>=0.72;
      const closeStructure=sameEngine&&world>=0.72&&contexts.length>0;
      const actionEngines=new Set(['fantasy_growth','hunter_growth','journey_quest','revenge_progression','protection_rescue','survival_strategy','extraordinary_conflict','game_progression']);
      const fantasyBridge=A.tagSet.has('fantasy')&&B.tagSet.has('fantasy')&&world>=0.72&&contexts.length>0&&actionEngines.has(A.primary)&&actionEngines.has(B.primary);
      // A recorded fantasy power-progression engine in the same secondary world
      // is a narrower tier-2 link than the generic "growth" tag. No tone is inferred.
      const fantasyStructure=A.tagSet.has('fantasy')&&B.tagSet.has('fantasy')&&sameEngine&&A.primary==='fantasy_growth'&&A.world==='secondary_fantasy_world'&&B.world===A.world;
      if(!domainContext&&!domainStructure&&!closeStructure&&!fantasyBridge&&!schoolBridge&&!fantasyStructure)return null;
      if((fantasyBridge||fantasyStructure)&&!domains.includes('fantasy'))domains.push('fantasy');
      if(schoolBridge&&!contexts.includes('school-bullying'))contexts.push('school-bullying');
      const missing=[];
      if(!A.primary)missing.push('기준 작품의 주된 전개');
      if(!A.world)missing.push('기준 작품의 배경');
      if(!B.primary)missing.push('추천 작품의 주된 전개');
      if(!B.world)missing.push('추천 작품의 배경');
      const evidence=[...new Set([...domains.slice(0,1).map(labelTag),...contexts.slice(0,2).map(labelTag)])];
      if(sameEngine)evidence.push(labelEngine(A.primary));
      if(!contexts.length&&world>=0.72)evidence.push('가까운 배경 설정');
      const score=0.30+Math.min(0.18,contexts.reduce((sum,t)=>sum+idf(t)*0.025,0))
        +(sameEngine?0.12:p.connection.strength*0.06)+(world>=0.72?0.06:0)
        +(a.media===b.media?0.02:0)-missing.length*0.025-p.axisDifferences.length*0.012-(fantasyStructure&&!contexts.length?0.10:0);
      return {pair:p,score,domains,contexts,missing,evidence};
    }
    function signals(state) {
      state=state||{};const positive=new Map(),negative=new Map(),blocked=[];
      const addPositive=(w,weight,kind)=>{
        if(!w)return;const key=ipKey(w),prev=positive.get(key);
        if(!prev||prev.weight<weight)positive.set(key,{work:w,weight,kind});
      };
      (state.selected||[]).forEach(id=>{const w=byId.get(String(id));addPositive(w,1,'selected');if(w)blocked.push(w);});
      (state.disliked||[]).forEach(id=>{const w=byId.get(String(id));if(w){negative.set(ipKey(w),{work:w,weight:1,reason:'disliked'});blocked.push(w);}});
      Object.entries(state.feedback||{}).forEach(([id,f])=>{
        const w=byId.get(String(id));if(!w||!f)return;
        if(f.status==='liked')addPositive(w,1,'liked');
        if(f.status==='want')addPositive(w,0.2,'want');
        // Forgetting is not a dislike or a claim that the work has been consumed.
        if(f.status!=='forgot')blocked.push(w);
        const nw=f.status==='meh'?0.8:f.status==='no'?0.35:f.status==='stopped'&&f.reason==='bored'?1:0;
        if(nw)negative.set(ipKey(w),{work:w,weight:nw,reason:f.reason||f.status});
      });
      return {positive:[...positive.values()],negative:[...negative.values()],blocked};
    }
    function learnedTags(state) {
      const unique=ids=>{const out=[];for(const id of ids){const w=byId.get(String(id));if(w&&!out.some(x=>isSameIP(x,w)))out.push(w);}return out;};
      const feedback=Object.entries(state.feedback||{});
      const liked=unique([...(state.selected||[]),...feedback.filter(([,f])=>f?.status==='liked').map(([id])=>id)]);
      // Only explicit dislike clicks count toward the three-work exclusion rule.
      const disliked=unique(state.disliked||[]);
      const count=list=>{const counts={};list.forEach(w=>new Set(info(w).tags).forEach(tag=>counts[tag]=(counts[tag]||0)+1));return counts;};
      const positive=count(liked),negative=count(disliked);
      return {positive,negative,excluded:Object.keys(negative).filter(tag=>negative[tag]>=3),
        boosted:Object.keys(positive).filter(tag=>positive[tag]>=2&&!(negative[tag]>=3))};
    }
    function learnedBoost(w,learned){
      const matches=info(w).tags.filter(tag=>learned.boosted.includes(tag));
      return Math.min(0.14,matches.reduce((sum,tag)=>sum+Math.min(5,learned.positive[tag]-1)*(BROAD.has(tag)?0.008:0.022),0));
    }
    function profile(state) {
      const sig=signals(state),axes={},coverage={};
      AXES.forEach(k=>{
        let sum=0,den=0,n=0;
        sig.positive.forEach(p=>{if(finite(p.work[k])){const axisTrust=(p.work.axisConfidence||p.work.confidence)==='확정'?1:0.72;const weight=p.weight*axisTrust;sum+=p.work[k]*weight;den+=weight;n++;}});
        axes[k]=den?sum/den:null;coverage[k]={available:n,total:sig.positive.length,weight:den};
      });
      const clusters=new Map();
      sig.positive.filter(p=>p.weight>=0.8).forEach(p=>{
        const i=info(p.work),key=i.primary||'unknown';
        if(!clusters.has(key))clusters.set(key,{engine:key,label:labelEngine(key),weight:0,works:[],worlds:new Set()});
        const c=clusters.get(key);c.weight+=p.weight;c.works.push(p.work);if(i.world)c.worlds.add(i.world);
      });
      return {...axes,axes,coverage,clusters:[...clusters.values()].map(c=>({...c,worlds:[...c.worlds]})).sort((a,b)=>b.weight-a.weight),
        positives:sig.positive,negatives:sig.negative,signalCount:sig.positive.filter(p=>p.weight>=0.8).length,hasSignal:sig.positive.length>0};
    }
    function safetyDecision(w,state,learning) {
      state=state||{};
      const i=info(w),missing=[],reasons=[],tagUnknown=[],knownAbsent=[];
      const learned=learning||learnedTags(state);
      learned.excluded.filter(tag=>i.tagSet.has(tag)).forEach(tag=>reasons.push('별로예요 '+learned.negative[tag]+'편에 반복된 태그: '+labelTag(tag)));
      const requested=new Set(state.exclude||[]);
      const warnings=w.contentWarnings || w.content_warnings || {};
      const avoided=preferenceItems(state.avoidedTags).filter(item=>item.kind==='tag');
      avoided.forEach(item=>{if(i.tagSet.has(item.value))reasons.push('회피한 태그: '+item.label);});
      const sceneAvoidance=new Set(avoided.filter(item=>item.value==='gore'||item.value==='horror').map(item=>item.value));
      ['gore','horror'].forEach(key=>{
        if(!requested.has(key)&&!sceneAvoidance.has(key))return;
        const value=warnings[key];
        const evidence=value&&typeof value==='object'?(value.sources||value.source||value.evidence):null;
        const hasEvidence=Array.isArray(evidence)?evidence.some(x=>typeof x==='string'&&x.trim()):typeof evidence==='string'&&!!evidence.trim();
        const exists=typeof value==='boolean'?value:value&&typeof value.present==='boolean'?value.present:null;
        if(exists===true)reasons.push(key==='gore'?'잔혹 장면 있음':'공포 분위기 있음');
        else if(exists===false&&hasEvidence) knownAbsent.push(key);
        else if(key==='horror'&&i.tagSet.has('horror'))reasons.push('공포 장르');
        else if(key==='gore'&&(i.tagSet.has('gore')||i.tagSet.has('graphic-violence')))reasons.push('잔혹 표현 태그');
        else if(requested.has(key))missing.push(key==='gore'?'잔혹 장면':'공포 분위기');
        else tagUnknown.push(key==='gore'?'잔혹 장면':'공포 분위기');
      });
      if(i.quality.rec==='HOLD')reasons.push('추천 검토 보류');
      const structureMissing=!i.primary||!i.world;
      const sceneUnknown=[...new Set([...missing,...tagUnknown])];
      const notices=[];
      if(sceneUnknown.length)notices.push(sceneUnknown.join(' · ')+' 여부 미확인');
      if(structureMissing)notices.push('서사 분류 근거 보완 필요');
      return {status:reasons.length?'blocked':missing.length||structureMissing?'uncertain':'confirmed',missing,tagUnknown,
        structureMissing,reasons:[...new Set(reasons)],notice:notices.join(' · '),conditionStatus:sceneUnknown.length?'needs_check':'not_requested_or_documented',
        sceneInfo:{policy:requested.has('gore')||requested.has('horror')?'strict':sceneAvoidance.size?'registered-tag-avoidance':'none',
          strictRestrictions:[...requested].filter(key=>key==='gore'||key==='horror'),tagAvoidance:[...sceneAvoidance],unknown:sceneUnknown,knownAbsent}};
    }
    function preferenceBoost(w,state) {
      let boost=0;const excludes=new Set(state.exclude||[]),priority=new Set(state.priority||[]),traits=new Set(state.traits||[]),i=info(w);
      if((excludes.has('unresolved')||traits.has('payoff'))&&finite(w.resolve))boost+=(w.resolve-50)/50*0.055;
      if(excludes.has('medical')&&(i.primary==='medical_cases'||i.tagSet.has('medical')||i.tagSet.has('hospital')))boost-=0.11;
      if(traits.has('overpowered'))boost+=i.tagSet.has('overpowered')?0.055:i.tagSet.has('underdog')?-0.035:0;
      const complexity=w.complexity||{};
      if(priority.has('easy')&&complexity.state!=='INSUFFICIENT'){
        const values=[complexity.overall,complexity.tracking].filter(finite);
        if(values.length)boost+=(3-values.reduce((s,v)=>s+v,0)/values.length)*0.025;
      }
      // Film is not necessarily short: use runtime/episode metadata only when actually supplied.
      const minutes=w.runtimeMinutes||w.durationMinutes;
      if(priority.has('short')&&finite(minutes))boost+=Math.max(-0.025,Math.min(0.025,(120-minutes)/120*0.025));
      if(priority.has('new')&&finite(w.year))boost+=clamp(1-(nowYear-w.year)/15)*0.025;
      return boost+preferenceDetails(w,state).boost;
    }
    function negativePenalty(w,negatives) {
      return Math.max(0,...negatives.map(n=>{const p=pair(n.work,w);return p.similar&&p.score>=0.6?0.13*n.weight*p.score:0;}));
    }
    function pairDifference(p) {
      const A=info(p.source),B=info(p.work),parts=[];
      if(A.primary&&B.primary&&A.primary!==B.primary)parts.push('주된 전개는 '+labelEngine(B.primary)+' 쪽이에요');
      if(B.world&&A.world!==B.world)parts.push('후보의 배경: '+labelWorld(B.world));
      if(p.source.media!==p.work.media)parts.push('감상 형식: '+p.work.media);
      parts.push(...p.contradictions);
      const differentContexts=[...B.context].filter(t=>!A.context.has(t)).slice(0,2);
      if(differentContexts.length)parts.push('후보 작품에는 '+differentContexts.map(labelTag).join(' · ')+' 요소가 있어요');
      return parts.slice(0,3).join('. ')+(parts.length?'.':'');
    }
    function reason(p,mode,supportCount) {
      const source='「'+p.source.title+'」',context=p.contextTags.slice(0,2).join(' · ');
      let text=mode==='discover'?source+'의 '+p.connection.text+' 흐름에서 연결점을 찾았어요.':source+'의 '+p.connection.text+' 흐름을 연결 기준으로 삼았어요.';
      if(context)text+=' '+context+'의 공통 맥락을 함께 반영했어요.';
      if(p.commonCreators&&p.commonCreators.length)text+=' 같은 집필 역할의 '+p.commonCreators.join(' · ')+' 작가 작품이에요.';
      if(mode==='match'&&supportCount>1)text+=' 좋아한 '+supportCount+'편에서 이 연결이 반복돼요.';
      return text;
    }
    function row(w,p,score,mode,supports,decision,cluster,state) {
      const i=info(w);return {work:w,score,source:p.source,sources:supports.map(s=>s.source),supportSources:supports.map(s=>s.source),supportCount:supports.length,
        sharedTags:p.sharedTags,descriptors:[],reason:reason(p,mode,supports.length),difference:pairDifference(p),novelty:pairDifference(p),
        qualityLabel:i.quality.label,qualityWeight:i.quality.weight,evidence:{engine:p.connection.slug||null,connection:p.connection.kind,context:p.contextTags,
          world:labelWorld(i.world),classification:i.quality.state,identity:i.quality.identity},decision,cluster,
        conditionNotice:decision.notice,conditionStatus:decision.conditionStatus,sceneInfo:decision.sceneInfo,
        preferenceMatches:preferenceDetails(w,state||{}),availabilityVerified:(w.dataStatus||{}).availability==='verified'};
    }
    function pickDiverse(rows,count,usedKeys,coverClusters) {
      const out=[],pending=[...rows],seen=new Set(usedKeys||[]),seenTitles=new Set(),clusterCounts=new Map();
      const remaining=()=>pending.filter(r=>!seen.has(ipKey(r.work))&&!seen.has('title:'+titleKey(r.work))&&!seenTitles.has(titleKey(r.work)));
      while(out.length<count&&pending.length){
        let available=remaining();if(!available.length)break;
        if(coverClusters){
          const freshClusters=available.filter(r=>!clusterCounts.has(r.cluster));
          if(freshClusters.length)available=freshClusters;
        }
        available.sort((a,b)=>{
          const ca=clusterCounts.get(a.cluster)||0,cb=clusterCounts.get(b.cluster)||0;
          const da=coverClusters?Math.min(0.13,ca*0.13):Math.min(0.06,out.filter(r=>info(r.work).primary===info(a.work).primary).length*0.03);
          const db=coverClusters?Math.min(0.13,cb*0.13):Math.min(0.06,out.filter(r=>info(r.work).primary===info(b.work).primary).length*0.03);
          return (b.score-db)-(a.score-da)||String(a.work.id).localeCompare(String(b.work.id));
        });
        const next=available[0];out.push(next);seen.add(ipKey(next.work));seenTitles.add(titleKey(next.work));
        clusterCounts.set(next.cluster,(clusterCounts.get(next.cluster)||0)+1);pending.splice(pending.indexOf(next),1);
      }
      return out;
    }
    function recommend(state, settings) {
      state=state||{};settings=settings||{};const limit=Math.max(0,Math.min(12,settings.limit==null?3:settings.limit));
      const user=profile(state),sig=signals(state),positives=sig.positive,learned=learnedTags(state);
      const result={match:[],similar:[],discover:[],uncertain:{match:[],similar:[],discover:[]},profile:user,
        diagnostics:{total:works.length,blocked:0,sceneUnknown:0,structureUnknown:0,qualified:{match:0,similar:0,discover:0},
          semantic:{match:0,similar:0,discover:0},preHistory:{match:0,similar:0,discover:0},conditionsFiltered:{match:0,similar:0,discover:0},historySkipped:{match:0,similar:0,discover:0},
          eligible:{match:0,similar:0,discover:0},uncertainCounts:{match:0,similar:0,discover:0},modeReasons:{},unresolvedIsPreference:(state.exclude||[]).includes('unresolved')}};
      if(!positives.length){['match','similar','discover'].forEach(mode=>result.diagnostics.modeReasons[mode]={code:'info_missing',message:'좋아한 작품을 먼저 골라주세요.',counts:{semantic:0,afterConditions:0,afterHistory:0,displayed:0},canRestartHistory:false});return result;}
      const blockedIP=new Set(sig.blocked.map(ipKey)),blockedTitles=new Set(sig.blocked.map(titleKey));
      const preferred=state.preferredMedia||[];
      const pivot=byId.get(String(state.pivot))||positives.find(p=>p.kind==='selected')?.work||positives[0].work;
      const fallbackRows=[];
      const rows={match:[],similar:[],discover:[]},unconfirmed={match:[],similar:[],discover:[]};
      const seenByMode=Object.fromEntries(['match','similar','discover'].map(mode=>{
        const seen=settings.ignoreHistory?[]:(state.recommendSeen&&state.recommendSeen[mode])||[];
        const seenWorks=seen.map(id=>byId.get(String(id))).filter(Boolean);
        return [mode,{ips:new Set(seenWorks.map(ipKey)),titles:new Set(seenWorks.map(titleKey))}];
      }));
      const groups=new Map(user.clusters.map(c=>[c.engine,c]));
      works.forEach(w=>{
        if(blockedIP.has(ipKey(w))||blockedTitles.has(titleKey(w)))return;
        if(info(w).quality.rec==='HOLD'){result.diagnostics.blocked++;return;}
        const decision=safetyDecision(w,state,learned);
        const mediaBlocked=preferred.length&&!preferred.includes(w.media),conditionBlocked=decision.status==='blocked'||mediaBlocked;
        if(conditionBlocked)result.diagnostics.blocked++;
        if(decision.missing.length||decision.tagUnknown.length)result.diagnostics.sceneUnknown++;
        if(decision.structureMissing)result.diagnostics.structureUnknown++;
        const pairs=positives.map(s=>({...pair(s.work,w),signalWeight:s.weight})).sort((a,b)=>b.score*b.signalWeight-a.score*a.signalWeight);
        const credible=pairs.filter(p=>p.similar||p.discover);
        const similarPairs=pairs.filter(p=>p.similar&&p.signalWeight>=0.8);
        const p=pair(pivot,w),interestBoost=Math.max(0,...pairs.filter(r=>r.signalWeight<0.8&&(r.similar||r.discover)).map(r=>r.score*r.signalWeight*0.05));
        const boost=preferenceBoost(w,state)+interestBoost+learnedBoost(w,learned),penalty=0;
        const push=(mode,r,partialAllowed=false)=>{
          const repeated=info(w).tags.filter(tag=>learned.boosted.includes(tag)).sort((a,b)=>learned.positive[b]-learned.positive[a]).slice(0,2);
          if(repeated.length)r.reason+=' 좋아한 작품에서 반복된 '+repeated.map(tag=>labelTag(tag)+'('+learned.positive[tag]+'편)').join(' · ')+'도 반영했어요.';
          const eligible=decision.status==='confirmed'||(partialAllowed&&!decision.missing.length);
          result.diagnostics.semantic[mode]++;
          if(conditionBlocked){result.diagnostics.conditionsFiltered[mode]++;return;}
          result.diagnostics.qualified[mode]++;
          if(eligible)result.diagnostics.preHistory[mode]++;else result.diagnostics.conditionsFiltered[mode]++;
          const seen=seenByMode[mode];if(seen.ips.has(ipKey(w))||seen.titles.has(titleKey(w))){result.diagnostics.historySkipped[mode]++;return;}
          (eligible?(r.similarityTier===2?fallbackRows:rows[mode]):unconfirmed[mode]).push(r);};
        if(similarPairs.length){
          // Rank within each positive narrative cluster; a romance + action taste never becomes a mean-story hybrid.
          const grouped=new Map();similarPairs.forEach(r=>{const key=info(r.source).primary||'unknown';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);});
          const ranked=[...grouped.entries()].map(([key,ps])=>{
            const cluster=groups.get(key),weight=cluster?cluster.weight:1;
            const avg=ps.reduce((s,r)=>s+r.score*r.signalWeight,0)/ps.reduce((s,r)=>s+r.signalWeight,0);
            const within=ps.length/Math.max(1,cluster?cluster.works.length:1);
            return {key,ps,score:ps[0].score*0.63+avg*0.24+Math.min(1,within)*0.055+Math.min(1,weight/3)*0.035};
          }).sort((a,b)=>b.score-a.score);
          const best=ranked[0],score=best.score+boost-penalty;
          push('match',row(w,best.ps[0],score,'match',best.ps,decision,best.key,state));
        }
        if(p.similar){const r=row(w,p,p.score+boost-penalty,'similar',[p],decision,info(p.source).primary,state);r.similarityTier=1;push('similar',r);}
        else {
          const f=fallbackPair(pivot,w);
          if(f){
            const r=row(w,p,f.score+boost-penalty,'similar',[p],decision,info(p.source).primary,state);
            r.similarityTier=2;r.fallbackEvidence={domains:f.domains,contexts:f.contexts,missing:f.missing};
            r.reason='「'+pivot.title+'」과 '+f.evidence.join(' · ')+' 요소가 겹쳐요. 이 공통점으로 추천 범위를 넓혔어요.';
            r.comparisonNotice=f.missing.length?f.missing.join(' · ')+' 정보가 부족해 전체 전개의 유사성은 확인하지 못했어요.':'배경·전개·세부 맥락을 함께 비교한 1순위 기준에는 못 미쳐요.';
            push('similar',r,true);
          }
        }
        const discoveries=credible.filter(r=>r.discover&&r.signalWeight>=0.8).map(r=>{
          const A=info(r.source),B=info(w);
          const change=(A.primary!==B.primary?0.035:0)+(A.world!==B.world?0.025:0)+(r.source.media!==w.media?0.025:0);
          return {p:r,qualificationScore:r.qualificationScore*0.85+change,score:r.score*0.85+change+boost-penalty};
        }).filter(r=>r.qualificationScore>=0.40).sort((a,b)=>b.score-a.score);
        if(discoveries.length){const d=discoveries[0];push('discover',row(w,d.p,d.score,'discover',[d.p],decision,info(d.p.source).primary,state));}
        // Useful candidates with incomplete world classification are disclosed separately, never promoted as strict similar matches.
        if(!conditionBlocked&&!credible.length&&decision.structureMissing){
          const partial=pairs.find(r=>r.connection&&r.connection.kind==='primary'&&r.contextSlugs.length>=1&&r.hardConflicts.length===0);
          if(partial&&partial.signalWeight>=0.8&&partial.score>=0.32){
            const uncertainDecision={...decision,status:'uncertain',notice:decision.notice||'배경 또는 진행 방식 추가 확인 필요'};
            const r=row(w,partial,partial.score,'discover',[partial],uncertainDecision,info(partial.source).primary,state);
            r.reason='「'+partial.source.title+'」의 '+partial.connection.text+' 흐름과 일부 연결되지만, 배경 또는 분류 근거를 더 확인해야 해요.';
            r.difference='분류가 보완되기 전에는 유사픽으로 확정하지 않아요.';
            const seen=seenByMode.discover;if(!seen.ips.has(ipKey(w))&&!seen.titles.has(titleKey(w)))unconfirmed.discover.push(r);
          }
        }
      });
      Object.keys(rows).forEach(mode=>{rows[mode].sort((a,b)=>b.score-a.score);unconfirmed[mode].sort((a,b)=>b.score-a.score);
        result.diagnostics.eligible[mode]=rows[mode].length+(mode==='similar'?fallbackRows.length:0);result.diagnostics.uncertainCounts[mode]=unconfirmed[mode].length;});
      // Reserve the pivot's strongest candidates before allocating aggregate recommendations.
      result.similar=pickDiverse(rows.similar,limit,new Set(),false);
      const keysFor=list=>new Set(list.flatMap(r=>[ipKey(r.work),'title:'+titleKey(r.work)]));
      const firstCount=result.similar.length;
      if(firstCount<limit)result.similar.push(...pickDiverse(fallbackRows,limit-firstCount,keysFor(result.similar),false));
      result.diagnostics.similarTiers={primaryCandidates:rows.similar.length,secondaryCandidates:fallbackRows.length,primaryShown:firstCount,secondaryShown:result.similar.length-firstCount};
      const similarKeys=keysFor(result.similar);
      result.match=pickDiverse(rows.match,limit,similarKeys,true);
      const used=keysFor([...result.match,...result.similar]);
      result.discover=pickDiverse(rows.discover,limit,used,true);
      const confirmedRows=[...result.match,...result.similar,...result.discover];
      result.uncertain.similar=pickDiverse(unconfirmed.similar,limit,keysFor(confirmedRows),false);
      const uncertainSimilarKeys=keysFor([...confirmedRows,...result.uncertain.similar]);
      result.uncertain.match=pickDiverse(unconfirmed.match,limit,uncertainSimilarKeys,true);
      result.uncertain.discover=pickDiverse(unconfirmed.discover,limit,keysFor([...confirmedRows,...result.uncertain.match,...result.uncertain.similar]),true);
      const sourceInfoMissing=!info(pivot).primary||!info(pivot).world;
      const allSourceInfoMissing=!positives.some(item=>item.weight>=0.8&&info(item.work).primary&&info(item.work).world);
      ['match','similar','discover'].forEach(mode=>{
        const d=result.diagnostics,counts={semantic:d.semantic[mode],afterConditions:d.preHistory[mode],afterHistory:d.eligible[mode],displayed:result[mode].length,
          pending:d.uncertainCounts[mode],conditionsFiltered:d.conditionsFiltered[mode],historySkipped:d.historySkipped[mode]};
        let code='ok',message='',cause=null,canRestartHistory=false;
        if(!result[mode].length){
          if((mode==='similar'?sourceInfoMissing:allSourceInfoMissing)&&d.semantic[mode]===0){code='info_missing';message=mode==='similar'?'기준 작품의 주된 전개나 배경 정보가 아직 부족해요. 같은 분야에서 작품을 찾아볼 수 있어요.':'좋아한 작품의 구체적인 전개와 배경 정보를 더 확인해야 해요.';}
          else if(d.semantic[mode]>0&&d.preHistory[mode]===0){code='conditions';message='연결되는 후보는 있지만 현재 추천 매체나 회피 조건을 통과하지 못했어요.';}
          else if(d.preHistory[mode]>0&&d.eligible[mode]===0){code='history_exhausted';message='이 기준의 후보를 모두 살펴봤어요. 앞서 본 추천을 다시 확인할 수 있어요.';canRestartHistory=true;}
          else if(d.eligible[mode]>0){code='history_exhausted';cause='other_modes';message='현재 후보가 다른 픽과 겹쳐 별도로 반복하지 않았어요.';}
          else {code='no_structural_match';message='배경·주된 전개·구체적인 맥락이 충분히 연결되는 후보를 아직 찾지 못했어요.';}
        }
        d.modeReasons[mode]={code,message,cause,counts,canRestartHistory};
      });
      return result;
    }
    function refreshAffinity(w, positiveWorks) {
      const list=(positiveWorks||[]).map(p=>p.work||p);const rows=list.map(p=>pair(p,w)).filter(p=>p.similar);
      if(!rows.length)return 0;
      const top=rows.sort((a,b)=>b.score-a.score).slice(0,3);
      return top[0].score*0.8+top.reduce((s,p)=>s+p.score,0)/top.length*0.2;
    }
    return Object.freeze({recommend,profile,pair,fallbackPair,learnedTags,affinity:(a,b)=>pair(a,b).score,qualifiesSimilar:(a,b)=>pair(a,b).similar,
      refreshAffinity,ipKey,isSameIP,safetyDecision,info,preferenceItems,preferenceDetails,labels:{engine:labelEngine,world:labelWorld,tag:labelTag},
      stats:()=>({works:works.length,cachedPairs:pairCache.size,tagCount:df.size}),version:'v16-20261015-feedback'});
  }
  global.ChalpickEngine=Object.freeze({create,version:'v16-20261015-feedback'});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.ChalpickEngine;
})(typeof window!=='undefined'?window:globalThis);

