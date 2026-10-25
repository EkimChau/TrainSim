import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteScene,longestSegment} from '../src/shared/simscene.js';
import {SimRun} from '../src/shared/simrun.js';
import {Train} from '../src/shared/models.js';
import {trainFormation} from '../src/shared/formation.js';

const route={id:8001,ref:'CAB',name:'Test line',segments:[[[153.02,-27.45],[153.02,-27.4501]],[[153.02,-27.45],[153.02,-27.4501],[153.02,-27.4502],[153.021,-27.4503]]]};

test('longest continuous route piece is used for playback',()=>{
  assert.equal(longestSegment(route.segments).length,4);
  assert.deepEqual(longestSegment([]),[]);
});
test('route scene follows the OSM geometry in metre steps',()=>{
  const run=new SimRun(createRouteScene(route,{speedMetersPerTick:5}));
  const first=run.step().trains[0].position;
  assert.ok(first.lat<-27.45&&first.lat>-27.4501,'moved about 5 m south along the first segment');
  for(let i=0;i<9;i++)run.step();
  assert.equal(run.tick,10);
});
test('same route yields repeatable steps',()=>{
  const a=new SimRun(createRouteScene(route)),b=new SimRun(createRouteScene(route));
  for(let i=0;i<40;i++)assert.deepEqual(a.step().events,b.step().events);
});
test('reject routes without a path and invalid coordinates',()=>{
  assert.throws(()=>createRouteScene({id:1,segments:[]}),RangeError);
  assert.throws(()=>new Train({id:'x',path:[{lat:'a',lng:1}]}),TypeError);
});
test('train formation uses the selected engine skin and carriage count',()=>{
  const scene=createRouteScene(route,{engine:{id:'QR-EMU-02',skin:'3b',carriages:6}});
  const train=scene.trains[0];
  assert.equal(train.id,'QR-EMU-02');
  assert.equal(train.skin,'3b');
  assert.equal(train.carriages,6);
  assert.equal(trainFormation(train,12).length,6);
  assert.throws(()=>new Train({id:'bad',path:route.segments[0].map(([lng,lat])=>({lat,lng})),carriages:4}),TypeError);
});
test('carriages follow the local route direction through a bend',()=>{
  const train=new Train({id:'QR-EMU-01',path:[{lat:0,lng:0},{lat:0,lng:.001},{lat:.001,lng:.001}]});
  train.segment=1;train.progress=.15;train.position={lat:.00015,lng:.001};
  const coaches=trainFormation(train,16);
  assert.equal(coaches.length,3);
  assert.ok(coaches[0].angle<10||coaches[0].angle>350,'leading coach points north');
  assert.ok(coaches[2].angle>80&&coaches[2].angle<100,'trailing coach still follows the eastbound track');
});
