import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteScene,longestSegment} from '../src/shared/simscene.js';
import {SimRun} from '../src/shared/simrun.js';
import {Train} from '../src/shared/models.js';

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
