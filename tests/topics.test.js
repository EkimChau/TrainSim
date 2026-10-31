import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LESSONS,lessonById} from '../src/client/tutorials/lessons.js';
import {createLessonState,stepLesson,lessonSnapshot} from '../src/client/tutorials/engine.js';
import {TOPICS,RAIL_COMPONENTS,DEFAULT_RAIL_LAYOUT,topicById,
  suggestedTopic,buildTopicScene,topicSimulation} from '../src/client/tutorials/topics.js';

const scene=(lesson,state,topic='overview')=>buildTopicScene(lesson,state,lessonSnapshot(state),topic);
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('topics are source anchored and use a single registered glossary',()=>{
  assert.ok(TOPICS.length>=8);
  const known=new Set(RAIL_COMPONENTS.map(c=>c.id));
  assert.equal(known.size,RAIL_COMPONENTS.length);
  for(const topic of TOPICS){
    assert.ok(topic.title&&topic.description&&topic.sources.length);
    assert.ok(topic.parts.length>=3);
    for(const id of topic.parts)assert.ok(known.has(id),topic.id+' missing '+id);
  }
  for(const component of RAIL_COMPONENTS){
    assert.ok(component.label&&component.place&&component.description);
    assert.match(component.source,/SUBSET-026/);
  }
  assert.equal(topicById('authority').id,'authority');
});

test('lesson 01 schematic derives MA limits, distinct speed values and LRBG from lesson state',()=>{
  const lesson=lessonById('ma');
  const start=createLessonState('ma');
  const first=scene(lesson,start,'authority');
  assert.equal(first.front,300);
  assert.equal(first.maEnd,900);
  assert.equal(first.maType,'EOA');
  assert.equal(first.targetSpeed,0);
  assert.equal(first.permittedSpeed,40);
  assert.equal(first.actualSpeed,null); // Never invent the speedometer reading
  assert.equal(first.authorityIssued,false);
  assert.equal(first.maEndProvided,true);
  assert.equal(first.lrbg.id,'BG101');
  assert.ok(first.references.some(x=>x.includes('3.8')));
  const granted=stepLesson(start,{type:'issue'});
  const moved=stepLesson(stepLesson(granted,{type:'advance'}),{type:'advance'});
  const result=scene(lesson,moved,'authority');
  assert.equal(result.front,500);
  assert.equal(result.authorityIssued,true);
  assert.equal(result.currentBg.id,'BG102');
  assert.equal(result.lrbg.id,'BG102');
  assert.equal(result.maEnd,900);
});

test('balise geometry is a reusable fixture and can be moved by a lesson technical input',()=>{
  const lesson=LESSONS.find(l=>l.authoredRule==='balise-link');
  assert.ok(lesson);
  const s=createLessonState(lesson.id);
  const original=scene(lesson,s,'balises');
  const edit=stepLesson(s,{type:'set',values:{expectedAt:610}});
  const updated=scene(lesson,edit,'balises');
  assert.equal(original.layout.baliseGroups[1].metres,500);
  assert.equal(updated.layout.baliseGroups[1].metres,610);
  assert.deepEqual(original.layout.baliseGroups.map(x=>x.id),updated.layout.baliseGroups.map(x=>x.id));
  assert.equal(original.layout.source,DEFAULT_RAIL_LAYOUT.source);
});

test('same lesson projection is reused by any topic rather than recomputed',()=>{
  const lesson=lessonById('ma');
  const state=stepLesson(createLessonState('ma'),{type:'issue'});
  const a=scene(lesson,state,'overview');
  const b=scene(lesson,state,'driver');
  assert.equal(a.front,b.front);
  assert.equal(a.maEnd,b.maEnd);
  assert.equal(a.permittedSpeed,b.permittedSpeed);
  assert.equal(a.phase,b.phase);
  assert.equal(a.readerRows,b.readerRows);
  assert.equal(a.layout.baliseGroups[0].metres,b.layout.baliseGroups[0].metres);
});

test('topic suggestions and simulations reuse authored and original lesson data',()=>{
  assert.equal(suggestedTopic(lessonById('ma')),'authority');
  assert.equal(suggestedTopic(lessonById('interlocking')),'route');
  assert.equal(suggestedTopic(LESSONS.find(l=>l.authoredRule==='confidence')),'position');
  for(const lesson of LESSONS.slice(0,15)){
    const scenario=topicSimulation(lesson);
    assert.ok(scenario&&scenario.steps.length>0,lesson.id);
    assert.ok(TOPICS.some(t=>t.id===suggestedTopic(lesson)));
  }
});

test('topic UI integrates with existing lesson/back routing and reduced-motion support',()=>{
  const view=source('src/client/tutorials/view.js');
  const topicView=source('src/client/tutorials/topic-view.js');
  const diagram=source('src/client/tutorials/topic-diagram.js');
  const css=source('public/tutorials.css');
  assert.match(view,/data-action':'back-lesson|backToLesson/);
  assert.match(view,/topicPage\(/);
  assert.match(view,/stepLesson\(this\.state,command\)/);
  assert.match(view,/location\.hash=.*tutorials/);
  assert.match(topicView,/topicPicker/);
  assert.match(topicView,/topic-dmi/);
  assert.match(diagram,/data-component/);
  assert.match(css,/\.topic-scene-svg/);
  assert.match(css,/prefers-reduced-motion/);
});
