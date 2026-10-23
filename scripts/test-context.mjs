import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,CONTEXT_ROTATION_KEY,themeById,matchesTheme,seoulParts,currentThemeIds,activeKoreanEvents,chooseVisitTheme} from '../public/context.js';

const at = day => new Date(`${day}T12:00:00+09:00`);
const works = (...ids) => ids.map((id,index) => ({id:index + 1,contextTags:[id],adult:false}));
function memoryStorage(initial = null) {
  let value = initial;
  let writes = 0;
  return {getItem:key => key === CONTEXT_ROTATION_KEY ? value : null,setItem:(key,next) => {assert.equal(key,CONTEXT_ROTATION_KEY);value = next;writes++;},get writes() {return writes;},get value() {return value;}};
}
function visits(count,options) {
  const storage = options.storage || memoryStorage();
  return Array.from({length:count},() => chooseVisitTheme({...options,storage}));
}
const counts = visits => visits.reduce((result,visit) => ({...result,[visit.group]:(result[visit.group] || 0) + 1}),{});

test('only explicitly curated context tags qualify, never generic genre words', () => {
  assert.equal(matchesTheme({tags:['로맨스','가족 유대'],description:'가을에 헤어지는 사랑'},themeById('autumn')),false);
  assert.equal(matchesTheme({contextTags:['autumn','rain']},themeById('autumn')),true);
  assert.equal(matchesTheme({contextTags:['autumn','rain']},'rain'),true);
  assert.equal(matchesTheme({contextTags:['made-up']},'made-up'),false);
  assert.equal(matchesTheme({},null),true);
});

test('day, night and ordinary clear weather are not recommendation themes', () => {
  for (const id of ['day','night','clear','cloudy']) assert.equal(themeById(id),undefined);
  assert.deepEqual(THEMES.filter(theme => theme.group === 'weather').map(theme => theme.id),['rain','snow']);
});

test('additional DB anniversaries use their Korean calendar dates and explicit tags', () => {
  for(const [id,day] of [['valentine','2026-02-14'],['white-day','2026-03-14'],['arbor','2026-04-05'],['teachers','2026-05-15'],['halloween','2026-10-31']]){
    assert.ok(activeKoreanEvents(at(day)).some(event=>event.id===id&&event.daysUntil===0));
    assert.equal(matchesTheme({contextTags:[id]},themeById(id)),true);
    assert.equal(matchesTheme({tags:['공포','로맨스']},themeById(id)),false);
  }
});

test('season changes on Seoul dates, including the UTC day boundary', () => {
  assert.equal(currentThemeIds(new Date('2026-08-31T14:59:59Z')).season,'summer');
  assert.equal(currentThemeIds(new Date('2026-08-31T15:00:00Z')).season,'autumn');
  assert.equal(currentThemeIds(at('2026-02-28')).season,'winter');
  assert.equal(currentThemeIds(at('2026-03-01')).season,'spring');
  assert.equal(seoulParts(new Date('2026-12-31T15:00:00Z')).year,2027);
});

test('Korean anniversary window includes the exact seven days before and after', () => {
  for (const day of ['2026-08-08','2026-08-15','2026-08-22']) assert.ok(activeKoreanEvents(at(day)).some(event => event.id === 'liberation'));
  for (const day of ['2026-08-07','2026-08-23']) assert.ok(!activeKoreanEvents(at(day)).some(event => event.id === 'liberation'));
});

test('holiday windows cross year boundaries without losing New Year or Christmas', () => {
  assert.deepEqual(activeKoreanEvents(at('2026-12-25')).map(event => event.id),['christmas','new-year']);
  assert.deepEqual(activeKoreanEvents(at('2027-01-01')).map(event => event.id),['christmas','new-year']);
  assert.deepEqual(activeKoreanEvents(at('2027-01-02')).map(event => event.id),['new-year']);
  assert.ok(activeKoreanEvents(at('2027-01-08')).some(event => event.id === 'new-year'));
  assert.ok(!activeKoreanEvents(at('2027-01-09')).some(event => event.id === 'new-year'));
});

test('official Korean lunar holiday dates are used rather than fixed Gregorian dates', () => {
  for (const [day,id] of [['2025-01-29','seollal'],['2025-10-06','chuseok'],['2026-02-17','seollal'],['2026-09-25','chuseok'],['2027-02-07','seollal'],['2027-09-15','chuseok']]) {
    assert.ok(activeKoreanEvents(at(day)).some(event => event.id === id && event.daysUntil === 0));
  }
  assert.ok(!activeKoreanEvents(at('2026-10-06')).some(event => event.id === 'chuseok'));
  const future = chooseVisitTheme({items:works('winter','seollal'),date:at('2030-02-03'),storage:memoryStorage()});
  assert.equal(future.lunarCalendarSupported,false);
  assert.deepEqual(future.activeEventIds,[]);
});

test('all three categories receive exactly 6:3:1 exposures in ten qualifying visits', () => {
  const result = visits(100,{items:works('rain','liberation','summer'),date:at('2026-08-15'),weather:'rain'});
  assert.deepEqual(counts(result.slice(0,10)),{weather:6,event:3,season:1});
  assert.deepEqual(counts(result),{weather:60,event:30,season:10});
  assert.deepEqual(result[0].probabilities,{weather:.6,event:.3,season:.1});
  assert.ok(result.every(visit => visit.rotationPersisted));
});

test('weather plus season redistributes to six of seven visits and one of seven', () => {
  const result = visits(7,{items:works('rain','summer'),date:at('2026-07-04'),weather:'rain'});
  assert.deepEqual(counts(result),{weather:6,season:1});
  assert.deepEqual(result[0].probabilities,{weather:6/7,season:1/7});
});

test('event plus season redistributes to three of four visits and one of four', () => {
  const result = visits(4,{items:works('liberation','summer'),date:at('2026-08-15')});
  assert.deepEqual(counts(result),{event:3,season:1});
});

test('weather plus event redistributes to two of three visits and one of three', () => {
  const result = visits(9,{items:works('rain','liberation'),date:at('2026-08-15'),weather:'rain'});
  assert.deepEqual(counts(result),{weather:6,event:3});
});

test('overlapping Korean anniversaries alternate whenever an event slot is shown', () => {
  const result = visits(8,{items:works('children','parents','spring'),date:at('2026-05-05')});
  assert.deepEqual(result.filter(visit => visit.group === 'event').map(visit => visit.theme.id),['children','parents','children','parents','children','parents']);
  assert.deepEqual(result[0].activeEventIds,['children','parents']);
});

test('when only anniversaries have candidates, every access alternates A then B', () => {
  const result = visits(4,{items:works('foundation','hangul'),date:at('2026-10-06')});
  assert.deepEqual(result.map(visit => visit.theme.id),['foundation','hangul','foundation','hangul']);
});

test('anniversaries with no curated works do not enter or interrupt the rotation', () => {
  const result = visits(4,{items:works('parents'),date:at('2026-05-05')});
  assert.ok(result.every(visit => visit.theme.id === 'parents'));
  assert.deepEqual(result[0].activeEventIds,['parents']);
  assert.deepEqual(result[0].calendarEventIds,['children','parents']);
});

test('unknown, sunny, cloudy or failed weather falls back to verified season or event', () => {
  for (const weather of [null,'clear','cloudy','storm',{condition:'rain',available:false},{condition:null,available:true}]) {
    const result = chooseVisitTheme({items:works('rain','autumn'),date:at('2026-10-23'),weather,storage:memoryStorage()});
    assert.equal(result.theme.id,'autumn');
    assert.deepEqual(result.weights,{season:1});
  }
  assert.equal(chooseVisitTheme({items:works('snow'),date:at('2026-12-10'),weather:{condition:'snow',available:true},storage:memoryStorage()}).theme.id,'snow');
});

test('an empty eligible pool returns no fabricated theme and writes no visit counter', () => {
  const storage = memoryStorage();
  const result = chooseVisitTheme({items:[{id:1,adult:true,contextTags:['autumn']}],date:at('2026-10-23'),storage});
  assert.equal(result.theme,null);
  assert.deepEqual(result.availableGroups,[]);
  assert.equal(storage.writes,0);
});

test('different availability combinations retain independent weighted schedules', () => {
  const storage = memoryStorage();
  const all = {items:works('rain','liberation','summer'),date:at('2026-08-15'),weather:'rain',storage};
  const rainy = [];
  for (let i = 0; i < 10; i++) {
    rainy.push(chooseVisitTheme(all));
    chooseVisitTheme({...all,weather:null});
  }
  assert.deepEqual(counts(rainy),{weather:6,event:3,season:1});
});

test('blocked or corrupt local storage does not crash theme selection', () => {
  const blocked = {getItem() {throw new Error('blocked');},setItem() {throw new Error('blocked');}};
  const result = chooseVisitTheme({items:works('autumn'),date:at('2026-10-23'),storage:blocked});
  assert.equal(result.theme.id,'autumn');
  assert.equal(result.rotationPersisted,false);
  for (const initial of ['{bad json','null','[]',JSON.stringify({version:1,schedules:{'weather|event|season':{weather:100000,event:-100000,season:0}},lastEventId:'made-up'})]) {
    const selected = chooseVisitTheme({items:works('rain','liberation','summer'),date:at('2026-08-15'),weather:'rain',storage:memoryStorage(initial)});
    assert.ok(selected.theme);
    assert.equal(selected.rotationPersisted,true);
  }
});

test('write-only storage failures preserve weighted rotation within the runtime', () => {
  for (const initial of [null,JSON.stringify({version:1,schedules:{'weather|event|season':{weather:-4,event:3,season:1}},lastEventId:null})]) {
    const storage = {getItem() {return initial;},setItem() {throw new Error('QuotaExceededError');}};
    const result = visits(10,{items:works('rain','liberation','summer'),date:at('2026-08-15'),weather:'rain',storage});
    assert.deepEqual(counts(result),{weather:6,event:3,season:1});
    assert.ok(result.every(visit => visit.rotationPersisted === false));
  }
});

test('failed writes preserve event alternation and later recover persistent storage', () => {
  let raw = null,fail = true;
  const storage = {getItem() {return raw;},setItem(key,value) {if (fail) throw new Error('QuotaExceededError');raw = value;}};
  const options = {items:works('children','parents'),date:at('2026-05-05'),storage};
  assert.equal(chooseVisitTheme(options).theme.id,'children');
  assert.equal(chooseVisitTheme(options).theme.id,'parents');
  fail = false;
  const recovered = chooseVisitTheme(options);
  assert.equal(recovered.theme.id,'children');
  assert.equal(recovered.rotationPersisted,true);
  assert.equal(chooseVisitTheme(options).theme.id,'parents');
});

test('a storage change from another tab supersedes an unsaved in-memory cursor', () => {
  let raw = null;
  const storage = {getItem() {return raw;},setItem() {throw new Error('QuotaExceededError');}};
  const options = {items:works('children','parents'),date:at('2026-05-05'),storage};
  assert.equal(chooseVisitTheme(options).theme.id,'children');
  raw = JSON.stringify({version:1,schedules:{},lastEventId:'parents'});
  assert.equal(chooseVisitTheme(options).theme.id,'children');
});
