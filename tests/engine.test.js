import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteScene,longestSegment} from '../src/shared/simscene.js';
import {SimRun} from '../src/shared/simrun.js';
import {Train} from '../src/shared/models.js';
import {trainFormation,trainIconAngle} from '../src/shared/formation.js';
import {Simulation} from '../src/client/map/sim.js';
import {TimeSimulation} from '../src/client/map/time-sim.js';

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
  assert.equal(trainFormation(train,12).length,2,'six cars use two three-car unit icons');
  assert.equal(trainFormation({...train,carriages:3},12).length,1,'three cars use one unit icon');
  assert.equal(trainFormation(train,12,2)[0].iconSize,36,'focused unit is enlarged');
  assert.throws(()=>new Train({id:'bad',path:route.segments[0].map(([lng,lat])=>({lat,lng})),carriages:4}),TypeError);
});
test('carriages follow the local route direction through a bend',()=>{
  const train=new Train({id:'QR-EMU-01',path:[{lat:0,lng:0},{lat:0,lng:.001},{lat:.001,lng:.001}]});
  train.segment=1;train.progress=.45;train.position={lat:.00045,lng:.001};
  const coaches=trainFormation(train,16);
  assert.equal(coaches.length,1);
  assert.ok(coaches[0].angle<10||coaches[0].angle>350,'leading coach points north');
});
test('train icon axis converts route bearings and applies a saved correction',()=>{
  assert.equal(trainIconAngle(0),0,'northbound SVG length axis points north by default');
  assert.equal(trainIconAngle(90),270,'eastbound track rotates the vertical SVG axis east');
  assert.equal(trainIconAngle(90,10),280,'axis correction applies to every route direction');
  assert.throws(()=>trainIconAngle(Number.NaN),TypeError);
});
test('simulation pause freezes time and enables the saved axis adjustment',t=>{
  const elements=new Map();
  for(const id of ['sim-play','sim-pause','sim-stop','sim-speed','sim-axis','sim-axis-value','sim-tick']){
    elements.set(id,{hidden:false,disabled:false,value:'0',textContent:'',addEventListener(){}});
  }
  const priorDocument=globalThis.document,priorSetInterval=globalThis.setInterval,priorClearInterval=globalThis.clearInterval;
  let intervalId=0,cleared=[];
  globalThis.document={getElementById:id=>elements.get(id)};
  globalThis.setInterval=()=>++intervalId;
  globalThis.clearInterval=id=>cleared.push(id);
  t.after(()=>{
    globalThis.document=priorDocument;
    globalThis.setInterval=priorSetInterval;
    globalThis.clearInterval=priorClearInterval;
  });
  const simulation=new Simulation({onFrame(){},log(){}});
  simulation.runner={scene:{trains:[]},step(){}};
  simulation.timer=9;
  simulation.togglePause();
  assert.equal(simulation.paused,true);
  assert.deepEqual(cleared,[9]);
  assert.equal(simulation.timer,null);
  assert.equal(elements.get('sim-axis').disabled,false);
  elements.get('sim-axis').value='35';
  simulation.applyAxisOffset();
  assert.equal(simulation.axisOffset,35);
  simulation.togglePause();
  assert.equal(simulation.paused,false);
  assert.equal(simulation.timer,1);
  assert.equal(elements.get('sim-axis').disabled,true);
  simulation.stop(false);
  assert.equal(elements.get('sim-tick').textContent,'idle');
});
test('calendar simulation exposes a four-year Brisbane-local slider and loads timetable data',async t=>{
  const elements=new Map();
  const getElement=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false,
      addEventListener(){},replaceChildren(...children){this.children=children;},setAttribute(){}});
    return elements.get(id);
  };
  const priorDocument=globalThis.document,priorFetch=globalThis.fetch,priorOption=globalThis.Option;
  globalThis.document={getElementById:getElement};
  globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
  const requests=[];
  globalThis.fetch=async url=>{
    requests.push(String(url));
    const status=String(url).includes('/calendar/status');
    return {ok:true,json:async()=>status
      ?{available:true,trips:10606,holidays:98}
      :{date:'2026-10-25',time:0,holidays:[],trains:[]}};
  };
  t.after(()=>{
    globalThis.document=priorDocument;
    globalThis.fetch=priorFetch;
    globalThis.Option=priorOption;
  });
  const simulation=new TimeSimulation({onFrame(){}});
  await simulation.load();
  const slider=getElement('time-slider');
  assert.equal(Number(slider.max)-Number(slider.min),simulation.max-simulation.min);
  assert.ok(simulation.max-simulation.min>4*365*86400000-2*86400000);
  assert.equal(slider.step,'60000');
  assert.equal(getElement('time-speed').value,'3600');
  assert.notEqual(getElement('time-current').textContent,'');
  assert.notEqual(getElement('sim-tick').textContent,'idle');
  assert.equal(simulation.loaded,true);
  assert.equal(requests.length,2,'load checks feed status then requests trains for the initial calendar time');
});
test('train details follow the next stop along the route',()=>{
  const scene=createRouteScene({id:1,name:'Local',to_name:'Destination',segments:[[[153,-27],[153.002,-27]]],
    stops:[{name:'Middle',lat:-27,lon:153.001},{name:'End',lat:-27,lon:153.0019}]},{speedMetersPerTick:110});
  const train=scene.trains[0];
  assert.equal(train.destination,'Destination');
  assert.equal(train.nextStop,'Middle');
  new SimRun(scene).step();
  assert.equal(train.nextStop,'End');
});
