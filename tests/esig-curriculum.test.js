import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {COURSE_META,COURSE_FIGURES,GENERATED_LESSONS,DIFFICULTIES} from '../src/client/tutorials/curriculum.js';
import {COURSE_SOURCE,FAMILY_SPEC} from '../src/client/tutorials/course-source.js';
import {LESSONS,lessonById} from '../src/client/tutorials/lessons.js';
import {createLessonState,stepLesson,lessonSnapshot,replayLesson} from '../src/client/tutorials/engine.js';

const reference=JSON.parse(fs.readFileSync(new URL('../public/internet-specs/esig-learning-index.json',import.meta.url),'utf8'));
test('source inventory is complete for 9 supplied SUBSET-026 chapters and does not invent deleted diagrams',()=>{
  assert.equal(COURSE_META.issue,'4.0.0');
  assert.equal(reference.metadata.counts.sections,316);
  assert.equal(COURSE_FIGURES.length,116);
  assert.equal(COURSE_FIGURES.filter(f=>!f.deleted).length,112);
  assert.equal(COURSE_FIGURES.filter(f=>f.deleted).length,4);
  assert.equal(COURSE_META.counts.packets,66);
  assert.equal(COURSE_META.counts.lessons,GENERATED_LESSONS.length);
  assert.equal(COURSE_SOURCE.modules.length,19);
  const figureTargets=new Set(GENERATED_LESSONS.flatMap(l=>l.sourceFigures.map(f=>f.id)));
  for(const f of reference.figures){
    if(f.deleted){assert.equal(f.coverage,'excluded_deleted');assert.deepEqual(f.lessonIds,[]);}
    else{
      assert.equal(f.coverage,'diagram_reexpressed_not_original');
      assert.ok(f.lessonIds.length>0,`Unmapped figure: ${f.id}`);
      assert.ok(figureTargets.has(f.id),`Missing live lesson for figure: ${f.id}`);
      for(const id of f.lessonIds)assert.ok(LESSONS.some(l=>l.id===id),`Broken figure mapping ${id}`);
    }
  }
});

test('every substantive TOC section is traceable, with deleted/editorial sections classified',()=>{
  for(const s of reference.sections){
    assert.ok(['interactive','cross_referenced','excluded_deleted','not_functional'].includes(s.coverage),s.id);
    if(s.coverage==='interactive'||s.coverage==='cross_referenced'){
      assert.ok(s.lessonIds.length,`Unmapped source clause ${s.id}`);
      for(const id of s.lessonIds)assert.ok(LESSONS.some(l=>l.id===id),`Unknown clause target ${id}`);
    }
    assert.equal(s.chapter,Number(s.id.split('.')[0]));
    assert.ok(s.page>=1);
  }
  assert.equal(new Set(LESSONS.map(l=>l.id)).size,LESSONS.length);
});

test('all generated lessons teach one primary concept and pin evidence and explicit limits',()=>{
  for(const l of GENERATED_LESSONS){
    assert.ok(l.clause&&l.moduleTitle&&l.familyDescriptor,l.id);
    assert.match(l.source[0],new RegExp(`^SUBSET-026-${l.chapter} v4\\.0\\.0 §`));
    assert.match(l.boundary,/NOT the SRS|not certified|Fictitious/i,l.id);
    assert.ok(FAMILY_SPEC[l.family],l.id);
    assert.equal(l.scenarios.length,6,l.id);
    assert.deepEqual(new Set(l.scenarios.map(s=>s.tier)),new Set(DIFFICULTIES.map(t=>t.id)));
    assert.ok(l.diagrams.flow.startsWith('flowchart'));
    assert.ok(l.diagrams.state.startsWith('stateDiagram-v2'));
    assert.ok(l.inputs.length>=3);
    assert.ok(l.inputs.every(i=>i.from&&i.id));
    assert.ok(l.actions.some(a=>a.tone==='red'));
    assert.ok(l.scenarios.filter(s=>s.tier==='busy').every(s=>s.steps.some(step=>step.burst?.length>=2)),l.id);
  }
});

test('all 1830 generated scenarios have deterministic test outcomes, distinct level fixtures and handheld identity',()=>{
  let checks=0;let busy=0;
  for(const l of GENERATED_LESSONS){
    for(const sc of l.scenarios){
      const result=replayLesson(l.id,sc.id);
      const exactCopy=replayLesson(l.id,sc.id);
      assert.deepEqual(result,exactCopy,`Non-deterministic replay ${l.id}/${sc.id}`);
      assert.equal(result.phase,sc.expect.phase,`${l.id}/${sc.id}`);
      for(const name of sc.expect.mustVisit??[])assert.ok(result.seenPhases.includes(name),`${l.id}/${sc.id} missing ${name}`);
      const projected=lessonSnapshot(result);
      assert.equal(projected.phase,result.phase);
      assert.ok(projected.stats.every(x=>x.label&&x.value!==undefined));
      assert.ok(projected.readerRows.every(x=>x.label&&x.value!==undefined));
      assert.equal(projected.statusTone,projected.valid?'ok':projected.statusTone);
      if(sc.tier==='busy'){
        assert.ok(result.events.some(e=>String(e.tick).startsWith('B')));
        assert.ok(result.seenPhases.includes('BLOCKED'));
        const bursts=result.events.filter(e=>String(e.tick).startsWith('B'));
        assert.ok(new Set(bursts.map(e=>e.tick)).size===1);
        busy++;
      }
      checks++;
    }
  }
  assert.equal(checks,GENERATED_LESSONS.length*6);
  assert.equal(busy,GENERATED_LESSONS.length*2);
});

test('busy failure alone never silently advances, and only explicit recovery permits evaluation',()=>{
  const l=lessonById('esig-3-13-9');
  assert.ok(l.family==='braking');
  let s=createLessonState(l.id);
  s=stepLesson(s,{type:'evaluate'});assert.equal(s.phase,'ACTIVE');
  s=stepLesson(s,{type:'disrupt'});assert.equal(s.phase,'REVIEW');
  s=stepLesson(s,{type:'progress'});assert.equal(s.phase,'REVIEW');
  s=stepLesson(s,{type:'evaluate'});assert.equal(s.phase,'BLOCKED');
  s=stepLesson(s,{type:'restore'});assert.equal(s.phase,'RECOVERED');
  s=stepLesson(s,{type:'evaluate'});assert.equal(s.phase,'ACTIVE');
});

test('toy braking model and position interval explicitly identify synthetic outputs',()=>{
  const braking=lessonById('esig-3-13-9');
  let s=createLessonState(braking.id);
  s=stepLesson(s,{type:'evaluate'});
  assert.ok(lessonSnapshot(s).facts.some(x=>x.label==='Toy stopping distance'));
  const position=lessonById('esig-3-6-4');
  s=createLessonState(position.id);s=stepLesson(s,{type:'evaluate'});
  assert.ok(lessonSnapshot(s).facts.some(x=>x.label==='Confidence example'&&x.value.includes('–')));
});
