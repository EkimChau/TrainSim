import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonById} from '../src/client/tutorials/lessons.js';
import {FIRST_SIM_LESSON,TRACK_WORLD,antennaPosition,occupancy,
  createSimulatorWorld,simulateNextStep} from '../src/client/tutorials/simulator/world.js';
import {isMovement,motionFrame,motionThresholds,motionReadings} from
  '../src/client/tutorials/simulator/motion.js';

const lesson=lessonById(FIRST_SIM_LESSON);
const initial=()=>createSimulatorWorld(lesson,'normal');
const advance=(world,n)=>{for(let i=0;i<n;i++)world=simulateNextStep(world,lesson);return world;};

test('animation derives intermediate physical position, section occupancy and speed from one world',()=>{
  const before=advance(initial(),6); // after authority update, front 384
  const after=simulateNextStep(before,lesson); // turnout to 652
  const original=JSON.stringify(before);
  assert.equal(isMovement(before,after),true);
  assert.deepEqual(motionFrame(before,after,0).trains[0].position,384);
  const early=motionFrame(before,after,0.3);
  const middle=motionFrame(before,after,0.5);
  const late=motionFrame(before,after,0.75);
  assert.equal(early.step,before.step);
  assert.ok(early.trains[0].position>384&&early.trains[0].position<500);
  assert.deepEqual(occupancy(early).TC2,[]);
  assert.deepEqual(occupancy(middle).TC2,['A']);
  assert.deepEqual(occupancy(middle).TC1,['A']);
  assert.deepEqual(occupancy(late).TC1,[]);
  assert.deepEqual(occupancy(late).TC2,['A']);
  assert.equal(middle.rbc.report.front,384,'RBC keeps the previous report until explicitly refreshed');
  assert.ok(middle.trains[0].speed<32&&middle.trains[0].speed>26);
  assert.equal(motionFrame(before,after,1),after);
  assert.equal(JSON.stringify(before),original,'animation cannot mutate its source state');
});

test('BTM is under the train and reads BG-1 only at antenna crossing, not front crossing',()=>{
  const before=advance(initial(),3); // front 308, before BG-1
  const after=simulateNextStep(before,lesson); // front 384
  const frontThreshold=TRACK_WORLD.balises[0].metres+TRACK_WORLD.antennaOffset;
  const trigger=(frontThreshold-before.trains[0].position)/
    (after.trains[0].position-before.trains[0].position);
  assert.ok(trigger>0&&trigger<1,'antenna must reach BG-1 during the animated step');
  const beforePassage=motionFrame(before,after,trigger-0.02);
  const atPassage=motionFrame(before,after,trigger+0.02);
  assert.equal(beforePassage.balises['BG-1'].count,0);
  assert.equal(beforePassage.trains[0].lrbg,undefined);
  assert.equal(atPassage.balises['BG-1'].count,1);
  assert.equal(atPassage.trains[0].lrbg,'BG-1');
  assert.ok(atPassage.events.some(e=>e.actor==='BTM'));
  assert.equal(atPassage.rbc.report,null,'RBC is not a live train-position sensor');
  assert.equal(antennaPosition(atPassage.trains[0])>TRACK_WORLD.balises[0].metres,true);
  assert.equal(before.trains[0].lrbg,undefined,'the input snapshot must stay unchanged');
});

test('the final scenario outcome after pausing just after a balise is not counted twice',()=>{
  const before=advance(initial(),3),after=simulateNextStep(before,lesson);
  const paused=motionFrame(before,after,0.96);
  assert.equal(paused.balises['BG-1'].count,1);
  assert.equal(paused.step,before.step);
  const resumed=simulateNextStep(paused,lesson);
  assert.equal(resumed.step,after.step);
  assert.equal(resumed.balises['BG-1'].count,1);
  assert.equal(resumed.trains[0].position,after.trains[0].position);
  assert.equal(resumed.trains[0].lrbg,'BG-1');
  assert.equal(resumed.events.filter(e=>e.actor==='BTM'&&e.message.includes('BG-1')).length,1);
});

test('same antenna positioning handles BG-2 on the diverging route',()=>{
  const before=advance(initial(),9),after=simulateNextStep(before,lesson);
  assert.equal(before.trains[0].position,652);
  assert.equal(after.trains[0].position,807);
  const threshold=TRACK_WORLD.balises[1].metres+TRACK_WORLD.antennaOffset;
  const fraction=(threshold-652)/(807-652);
  assert.ok(fraction>0&&fraction<1);
  assert.equal(motionFrame(before,after,fraction-0.01).balises['BG-2'].count,0);
  assert.equal(motionFrame(before,after,fraction+0.01).balises['BG-2'].count,1);
  assert.equal(motionFrame(before,after,fraction+0.01).trains[0].lrbg,'BG-2');
});

test('track circuit and point transitions have deterministic physical thresholds',()=>{
  const before=advance(initial(),6),after=simulateNextStep(before,lesson);
  const marks=motionThresholds(before,after);
  assert.ok(marks.some(e=>e.type==='point'&&e.metres===410));
  assert.ok(marks.some(e=>e.type==='section-front'&&e.id==='TC2'&&e.metres===500));
  assert.ok(marks.some(e=>e.type==='section-rear'&&e.id==='TC1'&&e.metres===518));
  assert.ok(marks.every(e=>e.fraction>=0&&e.fraction<=1));
  assert.deepEqual([...marks].sort((a,b)=>a.fraction-b.fraction),marks);
  const readings=motionReadings(before,after,0.6);
  assert.ok(readings.triggers.some(e=>e.id==='P1'));
  assert.ok(readings.occupancy.TC2.includes('A'));
});

test('incoming train B keeps TC3 occupied until its trailing end clears the section',()=>{
  const before=initial();
  before.trains[1].position=560;
  const after={...before,trains:before.trains.map(t=>t.id==='B'?{...t,position:420}:t)};
  const rearThreshold=TRACK_WORLD.sections.find(section=>section.id==='TC3').from-
    TRACK_WORLD.trainLength; // front coordinate at which rear clears TC3
  const marks=motionThresholds(before,after);
  assert.ok(marks.some(m=>m.id==='TC3'&&m.type==='section-rear'&&m.metres===rearThreshold));
  assert.deepEqual(occupancy(motionFrame(before,after,0.85)).TC3,['B']);
  assert.deepEqual(occupancy(motionFrame(before,after,0.96)).TC3,[]);
  assert.deepEqual(occupancy(before).TC3,['B']);
  assert.equal(before.trains[1].position,560);
});

test('renderer interpolates snapshots only; no invented speed/MA/RBC data',()=>{
  const before=advance(initial(),6),after=simulateNextStep(before,lesson);
  const frame=motionFrame(before,after,0.4);
  assert.deepEqual(frame.ma,before.ma);
  assert.deepEqual(frame.rbc,before.rbc);
  assert.equal(frame.lessonState,before.lessonState);
  assert.ok(frame.trains[0].speed<before.trains[0].speed);
  assert.equal(frame.events.filter(e=>e.actor==='RBC').length,
    before.events.filter(e=>e.actor==='RBC').length);
});
