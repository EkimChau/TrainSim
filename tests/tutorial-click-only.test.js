import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {TutorialsView} from '../src/client/tutorials/view.js';

const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function harness(){
  const menu={hidden:true};
  const attributes=new Map([['aria-expanded','false']]);
  const trigger={
    dataset:{action:'toggle-menu'},
    offsetWidth:42,
    classList:{remove(){},add(){}},
    getAttribute:key=>attributes.get(key)||null,
    setAttribute:(key,value)=>attributes.set(key,String(value)),
    closest(selector){return selector==='button'?this:null;},
  };
  const feedback={textContent:'',dataset:{}};
  const host={
    contains:target=>target===trigger,
    querySelector:selector=>({
      '.paper-lesson-menu':menu,
      '.paper-lesson-trigger':trigger,
      '.paper-interaction-feedback':feedback,
    })[selector]??null,
  };
  const view=Object.create(TutorialsView.prototype);
  view.host=host;view.notice='';view.noticeTone='ink';
  return {view,menu,trigger,feedback};
}

test('lesson catalogue remains closed until click, click toggles and ARIA stays synchronized',()=>{
  const {view,menu,trigger,feedback}=harness();
  assert.equal(menu.hidden,true);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  view.click({target:trigger});
  assert.equal(menu.hidden,false);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.match(feedback.textContent,/Lesson index toggled/);
  view.click({target:trigger});
  assert.equal(menu.hidden,true);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('Escape/outside-click can still close without hover or delayed timers',()=>{
  const {view,menu,trigger}=harness();
  view.click({target:trigger});
  assert.equal(menu.hidden,false);
  view.menu(false); // same method used by Escape and outside click handlers
  assert.equal(menu.hidden,true);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  const code=source('src/client/tutorials/view.js');
  assert.match(code,/event\.key==='Escape'\)this\.menu\(false\)/);
  assert.match(code,/if\(!this\.host\.contains\(event\.target\)\)this\.menu\(false\)/);
});

test('no pointer hover can open or dismiss the lesson catalogue',()=>{
  const view=source('src/client/tutorials/view.js');
  assert.doesNotMatch(view,/addEventListener\(['"]pointer(?:over|out|enter|leave)['"]/);
  assert.doesNotMatch(view,/hoverTimer/);
  assert.doesNotMatch(view,/title:'Hover or click/);
  assert.match(view,/action==='toggle-menu'/);
  assert.match(view,/aria-expanded/);
  assert.match(view,/class:'paper-lesson-menu',role:'menu',hidden:true/);
});

test('glossary term hover does not use native title tooltip; click and keyboard still select',()=>{
  const topic=source('src/client/tutorials/topic-view.js');
  const diagram=source('src/client/tutorials/topic-diagram.js');
  const view=source('src/client/tutorials/view.js');
  assert.doesNotMatch(topic,/title:item\.label\s*\+/);
  assert.match(topic,/'data-component':id,'aria-pressed':String\(id===selected\)/);
  assert.match(topic,/'aria-label':item\.term/);
  assert.match(diagram,/'data-component':id,role:'button',tabindex:0/);
  assert.match(view,/this\.topicComponent=component\.dataset\.component/);
  assert.match(view,/event\.key==='Enter'\|\|event\.key===' '/);
});

test('component click still selects the same source-linked definition without changing lesson state',()=>{
  const {view}=harness();
  let rendered=0,hashes=0;
  view.topicId='overview';view.topicComponent='';
  view.render=()=>{rendered++;};view.syncHash=()=>{hashes++;};
  const component={
    dataset:{component:'rbc'},
    closest(selector){return selector==='[data-component]'?this:null;},
  };
  view.host.contains=node=>node===component;
  view.click({target:component});
  assert.equal(view.topicComponent,'rbc');
  assert.equal(rendered,1);
  assert.equal(hashes,1);
});
