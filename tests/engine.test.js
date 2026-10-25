import test from 'node:test';
import assert from 'node:assert/strict';
import {SEED_WORLD} from '../src/shared/seed-world.js';
import {SimWorld} from '../src/shared/simworld.js';
import {compileDemoInstruments} from '../src/shared/simspec.js';
import {createScene,SCENES} from '../src/shared/simscene.js';
import {SimRun} from '../src/shared/simrun.js';

const world=()=>new SimWorld(SEED_WORLD);
test('seed rebase retains four tracks and six stations',()=>{const w=world();assert.equal(w.tracks.length,4);assert.equal(w.stations.length,6);});
test('midpoint compiler creates deterministic synthetic balises',()=>{
  const w=world();const result=compileDemoInstruments(w);
  assert.equal(result.devices.length,10);assert.equal(result.standardCompliant,false);
  assert.equal(result.devices[0].id,'DEMO-BG-001');assert.equal(w.trackside.length,10);
  assert.equal(result.devices[0].position.lat,(-27.4674-27.4661)/2);
});
test('every seed scene can run independent of any DOM or map',()=>{
  for(const info of SCENES){const run=new SimRun(createScene(info.id,world()));for(let i=0;i<20;i++)run.step();assert.equal(run.tick,20);assert.ok(run.scene.trains.every(t=>Number.isFinite(t.position.lat)));}
});
test('same seed yields repeatable steps',()=>{
  const a=new SimRun(createScene('bne-morning-peak',world()));const b=new SimRun(createScene('bne-morning-peak',world()));
  for(let i=0;i<60;i++)assert.deepEqual(a.step().events,b.step().events);
});
test('maintenance scenario exposes synthetic warning without claiming real safety enforcement',()=>{
  const r=new SimRun(createScene('ipswich-maintenance',world()));const types=new Set();
  for(let i=0;i<45;i++)for(const e of r.step().events)types.add(e.type);
  assert.ok(types.has('occupancy'));assert.ok(types.has('demo-warning'));
});
test('reject unknown scene and invalid WGS84 data types',()=>{
  assert.throws(()=>createScene('missing',world()),RangeError);
  assert.throws(()=>new SimWorld({tracks:[{id:'x',coords:[{lat:1,lng:2}]}],stations:[]}),TypeError);
});
