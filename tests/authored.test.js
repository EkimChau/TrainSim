import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTHORED_LESSONS} from '../src/client/tutorials/authored-lessons.js';
import {initialAuthoredState,stepAuthoredLesson,authoredSnapshot,evaluateAuthored} from '../src/client/tutorials/authored-engine.js';

const enact=(lesson,scenario)=>{
 let s=initialAuthoredState(lesson);
 for(const step of scenario.steps){const cmd=step.burst?{type:'burst',events:step.burst}:step.set?{type:'set',values:step.set}:{type:step.action};s=stepAuthoredLesson(s,cmd,lesson);}
 return s;
};

test('12 independent, source-anchored authored learning functions',()=>{
 assert.equal(AUTHORED_LESSONS.length,12);
 assert.equal(new Set(AUTHORED_LESSONS.map(x=>x.authoredRule)).size,12);
 for(const l of AUTHORED_LESSONS){
  assert.equal(l.status,'authored');assert.ok(l.source.length>=2);
  assert.equal(l.scenarios.length,6);assert.equal(l.inputs.length>=5,true);
  assert.equal(l.diagrams.actors.length>=4,true);
  assert.match(l.boundary,/no operational or safety certification/i);
 }
});
for(const l of AUTHORED_LESSONS){
 test(`${l.authoredRule}: six scenarios, guards, event order, projections`,()=>{
  for(const case_ of l.scenarios){
   const state=enact(l,case_);
   assert.equal(state.phase,case_.expect.phase,`${case_.id}: ${state.events.at(-1)?.message}`);
   const snap=authoredSnapshot(state,l);
   assert.equal(snap.phase,state.phase);assert.ok(snap.readerRows.length>=3);
   const expected=case_.expect.mustVisit??[];
   const visited=[...state.events.filter(e=>e.action==='evaluate').map(e=>e.message.startsWith('Withheld')?'BLOCKED':'ACTIVE')];
   if(expected.includes('BLOCKED'))assert.ok(visited.includes('BLOCKED'),case_.id);
   if(expected.includes('REVIEW'))assert.ok(state.events.some(e=>e.action==='burst'),case_.id);
   assert.deepEqual(state.events.map(e=>e.n),state.events.map((_,i)=>i+1));
  }
 });
}
test('BG linking checks group identity, direction and expectation window',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='balise-link');
 const i=initialAuthoredState(l).inputs;
 assert.equal(evaluateAuthored(l.key,i).ok,true);
 assert.equal(evaluateAuthored(l.key,{...i,detectedAt:560}).ok,false);
 assert.equal(evaluateAuthored(l.key,{...i,observedDirection:'reverse'}).ok,false);
});
test('front confidence interval is asymmetric and gamma-dependent',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='confidence');const i=initialAuthoredState(l).inputs;
 const baseline=evaluateAuthored(l.key,i).values;
 assert.equal(baseline.minSafeFront,'390 m');
 assert.equal(baseline.maxSafeFront,'412 m');
 assert.equal(evaluateAuthored(l.key,{...i,gamma:true,trainOver:4,trainUnder:3}).values.minSafeFront,'386 m');
});
test('EOA/LOA differ and shortening without acknowledgement is held',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='movement-authority');const i=initialAuthoredState(l).inputs;
 assert.equal(evaluateAuthored(l.key,i).values.type,'EOA');
 assert.equal(evaluateAuthored(l.key,{...i,targetSpeed:40}).values.type,'LOA');
 assert.equal(evaluateAuthored(l.key,{...i,proposedEnd:500}).ok,false);
 assert.equal(evaluateAuthored(l.key,{...i,proposedEnd:500,shorteningAck:true}).ok,true);
});
test('sampled speed restriction preserves gradient separately',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='speed-gradient');const i=initialAuthoredState(l).inputs;
 assert.equal(evaluateAuthored(l.key,i).values.sampleCeiling,'70 km/h');
 assert.equal(evaluateAuthored(l.key,{...i,temporarySpeed:110}).values.sampleCeiling,'90 km/h');
 assert.equal(evaluateAuthored(l.key,{...i,gradient:20}).values.sampleCeiling,'70 km/h');
});
test('braking budget degrades with speed/distance and is marked non-normative',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='brake-target');const i=initialAuthoredState(l).inputs;
 const a=evaluateAuthored(l.key,i).values;
 const b=evaluateAuthored(l.key,{...i,speed:110,distance:160}).values;
 assert.ok(Number.parseFloat(b.toyMargin)<Number.parseFloat(a.toyMargin));
 assert.match(l.boundary,/NOT.*ETCS/);
});
test('conditional emergency beyond min front accepted; unconditional trips; revocation must match ID',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='emergency');const i=initialAuthoredState(l).inputs;
 assert.equal(evaluateAuthored(l.key,i).values.accepted,'Yes');
 assert.equal(evaluateAuthored(l.key,{...i,type:'unconditional'}).values.stopLocation,'Immediate trip');
 assert.equal(evaluateAuthored(l.key,{...i,stopAt:100}).ok,false);
 assert.equal(evaluateAuthored(l.key,{...i,revocation:true,revokeId:1}).ok,false);
 assert.equal(evaluateAuthored(l.key,{...i,revocation:true,revokeId:22}).ok,true);
});
test('RBC handover accepts one-session degradation but requires train and route data',()=>{
 const l=AUTHORED_LESSONS.find(x=>x.key==='rbc-handover');const i=initialAuthoredState(l).inputs;
 assert.equal(evaluateAuthored(l.key,{...i,onboardSession:false}).ok,true);
 assert.equal(evaluateAuthored(l.key,{...i,routeInfo:false}).ok,false);
});