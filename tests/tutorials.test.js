import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,lessonById} from '../src/client/tutorials/lessons.js';
import {createLessonState,stepLesson,lessonSnapshot,replayLesson} from '../src/client/tutorials/engine.js';

test('lesson registry is unique and every input has an explicit source',()=>{
  assert.equal(new Set(LESSONS.map(x=>x.id)).size,LESSONS.length);
  assert.ok(LESSONS.length>=3);
  for(const lesson of LESSONS){
    assert.ok(lesson.source.length>0);
    assert.ok(lesson.diagrams.flow.startsWith('flowchart'));
    assert.ok(lesson.diagrams.state.startsWith('stateDiagram'));
    assert.ok(lesson.inputs.every(i=>i.from&&i.label));
    assert.ok(lesson.scenarios.every(s=>s.expect&&s.steps.length));
  }
});

test('all registered scenarios replay to their expected assertions',()=>{
  let n=0;
  for(const lesson of LESSONS){
    for(const scenario of lesson.scenarios){
      const state=replayLesson(lesson.id,scenario.id);
      const snapshot=lessonSnapshot(state);
      for(const [key,value] of Object.entries(scenario.expect)){
        const result=key==='maIssued'?Boolean(state.ma):key==='remaining'?Math.max(0,state.ma.end-state.inputs.front):
          key==='front'?state.inputs.front:state[key];
        assert.equal(result,value,`${lesson.id}/${scenario.id}: ${key}`);
      }
      assert.equal(snapshot.phase,state.phase);
      assert.ok(snapshot.readerRows.every(r=>r.label&&r.value!==undefined));
      n++;
    }
  }
  assert.ok(n>=12);
});

test('MA uses EOA at zero target speed, LOA at nonzero end speed',()=>{
  let s=createLessonState('ma');
  s=stepLesson(s,{type:'issue'});
  assert.equal(s.ma.kind,'EOA');
  assert.equal(s.ma.end,900);
  assert.equal(lessonSnapshot(s).readerRows[1].label,'EOA');
  s=stepLesson(s,{type:'set',values:{target:40}});
  s=stepLesson(s,{type:'issue'});
  assert.equal(s.ma.kind,'LOA');
  assert.equal(lessonSnapshot(s).readerRows[1].label,'LOA');
});

test('issued values do not silently change when candidate input changes',()=>{
  let s=createLessonState('ma');s=stepLesson(s,{type:'issue'});
  s=stepLesson(s,{type:'set',values:{end:1100,permitted:70}});
  assert.equal(s.ma.end,900);
  assert.equal(s.ma.permitted,40);
  assert.equal(lessonSnapshot(s).readerRows[1].value,'900 m');
  s=stepLesson(s,{type:'issue'});
  assert.equal(s.ma.end,1100);
  assert.equal(s.ma.permitted,70);
});

test('authority remaining and handheld readings share a single computed projection',()=>{
  let s=createLessonState('ma');s=stepLesson(s,{type:'issue'});
  s=stepLesson(s,{type:'advance'});
  const snap=lessonSnapshot(s);
  assert.equal(snap.phase,'TRAIN_RUNNING');
  assert.equal(snap.stats[1].value,'500 m');
  assert.equal(snap.readerRows[0].value,'500 m');
  assert.equal(snap.speedline.position,400);
  assert.equal(snap.speedline.speed,40);
});

test('existing MA is not implicitly revoked by trackside occupancy or radio loss',()=>{
  let s=createLessonState('ma');s=stepLesson(s,{type:'issue'});
  s=stepLesson(s,{type:'occupy'});
  assert.equal(s.phase,'REVIEW');
  assert.ok(s.ma);
  const start=s.inputs.front;s=stepLesson(s,{type:'advance'});
  assert.equal(s.inputs.front,start);
  s=stepLesson(s,{type:'set',values:{radioSafe:false}});
  assert.ok(s.ma,'loss of radio does not magically revoke an already received authority');
  assert.equal(lessonSnapshot(s).status,'Review required');
});

test('front cannot advance past authority end and no movement with missing authority',()=>{
  let s=createLessonState('ma');
  s=stepLesson(s,{type:'advance'});assert.equal(s.inputs.front,300);
  s=stepLesson(s,{type:'issue'});
  for(let n=0;n<20;n++)s=stepLesson(s,{type:'advance'});
  assert.equal(s.inputs.front,900);
  assert.equal(s.phase,'AT_BOUNDARY');
});

test('interlocking refuses missing flank or conflicting route, holds approach lock',()=>{
  let s=createLessonState('interlocking');
  s=stepLesson(s,{type:'set',values:{flankLocked:false}});
  s=stepLesson(s,{type:'request'});assert.equal(s.phase,'ROUTE_DENIED');
  s=stepLesson(s,{type:'reset'});s=stepLesson(s,{type:'request'});
  s=stepLesson(s,{type:'set',values:{approachOccupied:true}});
  s=stepLesson(s,{type:'cancel'});
  assert.equal(s.phase,'APPROACH_HELD');assert.equal(s.routeLocked,true);
});

test('radio session and position reports are distinct and reports remain historical',()=>{
  let s=createLessonState('radio');
  s=stepLesson(s,{type:'report'});assert.equal(s.phase,'REPORT_BLOCKED');
  s=stepLesson(s,{type:'connect'});assert.equal(s.session,true);
  s=stepLesson(s,{type:'report'});assert.equal(s.report.front,300);
  s=stepLesson(s,{type:'drop'});assert.equal(s.session,false);
  assert.equal(s.report.front,300);
});

test('rejects unknown IDs and invalid numeric / text inputs; immutable prior states',()=>{
  const s=createLessonState('ma');
  assert.throws(()=>stepLesson(s,{type:'set',values:{front:-1}}),/must be/);
  assert.throws(()=>stepLesson(s,{type:'set',values:{notAField:1}}),/Unknown lesson input/);
  const updated=stepLesson(s,{type:'set',values:{front:500}});
  assert.equal(s.inputs.front,300);
  assert.equal(updated.inputs.front,500);
  const radio=createLessonState('radio');
  assert.throws(()=>stepLesson(radio,{type:'set',values:{trainId:' '.repeat(3)}}),/characters/);
  assert.equal(lessonById('notfound').id,'ma');
});