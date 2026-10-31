import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lessonById} from '../src/client/tutorials/lessons.js';
import {
 FIRST_SIM_LESSON,TRACK_WORLD,SIMULATOR_COMPONENTS,SIMULATOR_SCENARIOS,
 createSimulatorWorld,simulateNextStep,hasNextSimulatorStep,occupancy,
 componentReadings,trackPoint,simulatorSummary
} from '../src/client/tutorials/simulator/world.js';

const lesson=lessonById(FIRST_SIM_LESSON);
const start=id=>createSimulatorWorld(lesson,id);
const advance=(world,n=1)=>{let next=world;for(let i=0;i<n;i++)next=simulateNextStep(next,lesson);return next;};
const finished=world=>{let next=world;while(hasNextSimulatorStep(next))next=simulateNextStep(next,lesson);return next;};
const code=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Lesson 009 owns the first reusable simulator world and all components have stable ids',()=>{
  assert.equal(lesson.number,'009');
  assert.equal(lesson.authoredRule,'ixl-boundary');
  assert.ok(SIMULATOR_COMPONENTS.length>=14);
  assert.equal(new Set(SIMULATOR_COMPONENTS.map(x=>x.id)).size,SIMULATOR_COMPONENTS.length);
  assert.ok(TRACK_WORLD.sections.some(s=>s.id==='TC2'));
  assert.ok(TRACK_WORLD.balises.some(b=>b.id==='BG-1'));
  assert.ok(TRACK_WORLD.tracks.some(t=>t.id==='diverge'));
  assert.ok(SIMULATOR_SCENARIOS.length>=3);
});
test('route is proved using existing authored function and point locks on progress',()=>{
  const first=start();
  assert.equal(first.route.accepted,false);
  assert.equal(occupancy(first).TC1[0],'A');
  assert.equal(occupancy(first).TC3[0],'B');
  let world=advance(first);
  assert.equal(world.route.accepted,true);
  assert.equal(world.lessonState.phase,'ACTIVE');
  assert.equal(world.point.locked,false);
  world=advance(world);
  assert.equal(world.point.position,'reverse');
  assert.equal(world.point.locked,true);
  assert.equal(world.route.locked,true);
  assert.equal(world.lessonState.phase,'PROGRESS');
});
test('balise passage updates the OBU reference, not the RBC before a report',()=>{
  const world=advance(start(),4);
  assert.equal(world.trains[0].position,384);
  assert.equal(world.trains[0].lrbg,'BG-1');
  assert.equal(world.balises['BG-1'].count,1);
  assert.equal(world.trains[0].speed,32);
  assert.equal(world.rbc.report,null);
  const reported=advance(world,1);
  assert.equal(reported.rbc.report.front,384);
  assert.equal(reported.rbc.report.speedKmh,32);
  assert.equal(reported.rbc.report.lrbg,'BG-1');
  assert.match(reported.rbc.report.source,/OBU estimated position/);
  assert.match(componentReadings(reported,'radio').readings[2][1],/none from mast/);
  assert.equal(advance(reported,1).ma.status,'fixture issued');
});
test('RBC retains a historical report until the onboard train explicitly sends another',()=>{
  const first=advance(start(),6);
  assert.equal(first.rbc.report.front,384);
  const moved=advance(first,1);
  assert.equal(moved.trains[0].position,652);
  assert.equal(moved.trains[0].speed,26);
  assert.equal(moved.rbc.report.front,384);
  const refresh=advance(moved,1);
  assert.equal(refresh.rbc.report.front,652);
  assert.equal(refresh.rbc.report.speedKmh,26);
  assert.equal(refresh.rbc.report.lrbg,'BG-1');
  const nearBoundary=advance(refresh,2);
  assert.equal(nearBoundary.trains[0].position,807);
  assert.equal(nearBoundary.rbc.report.front,652);
  const second=advance(nearBoundary,1);
  assert.equal(second.rbc.report.front,807);
  assert.equal(second.rbc.report.speedKmh,18);
  assert.equal(second.rbc.report.lrbg,'BG-2');
});

test('a train follows point geometry, occupies TC2, crosses BG-2 and releases only after clearing',()=>{
  const mid=advance(start(),7);
  assert.equal(mid.trains[0].track,'diverge');
  assert.equal(mid.trains[0].position,652);
  assert.deepEqual(occupancy(mid).TC2,['A']);
  assert.equal(mid.trains[1].track,'upper');
  const incoming=advance(start(),9);
  assert.equal(incoming.trains[1].position,700);
  assert.equal(incoming.trains[1].direction,-1);
  const p=trackPoint('diverge',465);
  assert.ok(p.y>210&&p.y<300);
  const entered=advance(start(),12);
  assert.equal(entered.balises['BG-2'].count,1);
  assert.equal(entered.trains[0].level,'L2');
  const end=finished(start());
  assert.equal(end.route.status,'released');
  assert.equal(end.point.locked,false);
  assert.equal(end.lessonState.phase,'COMPLETE');
  assert.equal(end.ma.status,'historical fixture');
  assert.deepEqual(occupancy(end).TC2,[]);
});
test('point failure cannot create a proved route and explicitly requires recovery',()=>{
  const first=advance(start('point-failure'),2);
  assert.equal(first.lessonState.phase,'BLOCKED');
  assert.equal(first.route.accepted,false);
  assert.equal(first.point.locked,false);
  assert.equal(first.ma.end,null);
  const recovered=advance(first,2);
  assert.equal(recovered.route.accepted,true);
  assert.equal(recovered.point.locked,false);
  assert.equal(recovered.lessonState.phase,'ACTIVE');
  const locked=advance(recovered);
  assert.equal(locked.point.locked,true);
});
test('competing train occupies TC2 and refuses proof until it clears',()=>{
  const initial=start('conflicting-train');
  assert.deepEqual(occupancy(initial).TC2,['B']);
  const refused=advance(initial);
  assert.equal(refused.lessonState.phase,'BLOCKED');
  assert.equal(refused.route.accepted,false);
  const clear=advance(refused);
  assert.deepEqual(occupancy(clear).TC2,[]);
  assert.equal(clear.trains[1].position,1000);
  assert.equal(clear.trains[1].direction,1);
  assert.equal(clear.route.accepted,false); // No auto-accept when a detector clears
  const proved=advance(clear);
  assert.equal(proved.route.accepted,true);
});
test('same assets present L2-to-L0 as explicitly illustrative, not a normative transition',()=>{
  const world=finished(start('return-l0'));
  assert.equal(world.trains[0].level,'L0');
  assert.ok(world.events.some(e=>e.message.includes('NOT SUBSET-026 transition rules')));
  assert.ok(world.events.some(e=>e.message.includes('BG-2')));
});
test('world reducer is immutable and repeated actions are byte-for-byte deterministic',()=>{
  const base=start();
  const snapshot=JSON.stringify(base);
  const a=finished(base),b=finished(base);
  assert.equal(JSON.stringify(base),snapshot);
  assert.deepEqual(a,b);
  assert.equal(a.events.at(-1).tick,a.tick);
  assert.equal(simulatorSummary(a).complete,true);
  assert.equal(hasNextSimulatorStep(a),false);
  assert.equal(simulateNextStep(a,lesson),a);
});
test('renderer and route use common SVG components and accessible source-labelled readings',()=>{
  const vector=code('src/client/tutorials/simulator/vector.js');
  const view=code('src/client/tutorials/simulator/view.js');
  const nav=code('src/client/tutorials/view.js');
  const css=code('public/tutorials.css');
  assert.match(vector,/installRailSymbols/);
  assert.match(vector,/sim-symbol-train/);
  assert.match(vector,/data-sim-component/);
  assert.match(vector,/requestAnimationFrame/);
  assert.match(view,/dmiInstrument/);
  assert.match(view,/simulatorPage/);
  assert.match(nav,/simulatorPlay/);
  assert.match(nav,/simulator=|parts\.set\('simulator'/);
  assert.match(css,/sim-dmi-content/);
  assert.match(css,/Courier New/);
  assert.match(css,/prefers-reduced-motion/);
});
