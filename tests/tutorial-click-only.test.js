import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TutorialsView} from '../src/client/tutorials/view.js';
import {topicPage} from '../src/client/tutorials/topic-view.js';
import {lessonById} from '../src/client/tutorials/lessons.js';
import {createLessonState,lessonSnapshot} from '../src/client/tutorials/engine.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function harness(){
  const focused=[];
  const view=Object.create(TutorialsView.prototype);
  view.topicId='overview';
  view.topicComponent='';
  view.topicPopupId='';
  view.host={
    contains:node=>node?.accepted===true,
    querySelector:selector=>selector.startsWith('[data-glossary-term')
      ?{focus:()=>focused.push(selector)}:null,
  };
  let rendered=0,hashes=0;
  view.render=()=>{rendered++;};
  view.syncHash=()=>{hashes++;};
  const term=(id)=>({
    accepted:true,
    dataset:{glossaryTerm:id,component:id},
    closest(selector){
      if(selector==='[data-glossary-term]'||selector==='[data-component]')return this;
      return null;
    }
  });
  const diagram=(id)=>({
    accepted:true,
    dataset:{component:id},
    closest(selector){return selector==='[data-component]'?this:null;}
  });
  const close={
    accepted:true,
    closest(selector){return selector==='[data-action="close-term-definition"]'?this:null;}
  };
  return {view,term,diagram,close,focused,
    get rendered(){return rendered;},get hashes(){return hashes;}};
}

test('clicking a glossary noun opens its definition, clicking again closes',()=>{
  const x=harness();
  x.view.click({target:x.term('rbc')});
  assert.equal(x.view.topicPopupId,'rbc');
  assert.equal(x.view.topicComponent,'rbc');
  assert.equal(x.rendered,1);
  assert.equal(x.hashes,1);
  assert.equal(x.focused.length,1);
  x.view.click({target:x.term('rbc')});
  assert.equal(x.view.topicPopupId,'');
  assert.equal(x.view.topicComponent,'rbc');
  assert.equal(x.rendered,2);
  assert.equal(x.hashes,2);
});

test('clicking another glossary term switches one floating panel, not two',()=>{
  const x=harness();
  x.view.click({target:x.term('rbc')});
  x.view.click({target:x.term('balise')});
  assert.equal(x.view.topicPopupId,'balise');
  assert.equal(x.view.topicComponent,'balise');
  assert.equal(x.hashes,2);
});

test('close button hides the glossary panel and restores focus',()=>{
  const x=harness();
  x.view.click({target:x.term('rbc')});
  x.view.click({target:x.close});
  assert.equal(x.view.topicPopupId,'');
  assert.ok(x.focused.at(-1).includes('rbc'));
  assert.equal(x.rendered,2);
  assert.equal(x.hashes,1);
});

test('existing diagram click still selects the source-linked inspector and dismisses popup',()=>{
  const x=harness();
  x.view.click({target:x.term('rbc')});
  x.view.click({target:x.diagram('balise')});
  assert.equal(x.view.topicPopupId,'');
  assert.equal(x.view.topicComponent,'balise');
  assert.equal(x.hashes,2);
});

test('glossary term hover cannot open native title tooltip or component popup',()=>{
  const topic=read('src/client/tutorials/topic-view.js');
  const view=read('src/client/tutorials/view.js');
  assert.doesNotMatch(topic,/title\s*:\s*item\.label\s*\+/);
  assert.match(topic,/'data-glossary-term':id/);
  assert.match(topic,/hidden:!definition/);
  assert.match(topic,/'aria-expanded':String\(id===opened\)/);
  assert.match(topic,/class:'topic-term-popover'/);
  assert.doesNotMatch(view,/addEventListener\(['"]pointer(?:over|enter)['"][\s\S]*topicPopupId/);
  assert.match(view,/const term=event\.target\.closest\('\[data-glossary-term\]'\)/);
});

test('Lesson catalogue keeps its previous hover behaviour: unrelated scope is unchanged',()=>{
  const view=read('src/client/tutorials/view.js');
  assert.match(view,/this\.host\.addEventListener\('pointerover'/);
  assert.match(view,/if\(event\.target\.closest\('\[data-picker\]'\)\)this\.menu\(true\)/);
  assert.match(view,/if\(picker&&!picker\.contains\(event\.relatedTarget\)\)this\.hoverTimer/);
  assert.match(view,/action==='toggle-menu'/);
});

test('keyboard and outside dismiss remain supported for the glossary popup',()=>{
  const view=read('src/client/tutorials/view.js');
  assert.match(view,/if\(event\.key==='Escape'\)\{/);
  assert.match(view,/this\.topicPopupId='';\s*this\.render\(\)/);
  assert.match(view,/event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(view,/if\(!this\.host\.contains\(event\.target\)\)\{/);
  assert.match(view,/!event\.target\.closest\('\.topic-glossary'\)/);
});

class NodeStub{
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this._text='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...items){this.children.push(...items);}
  addEventListener(){}
  set className(v){this.attrs.class=v;}
  get textContent(){return this._text+this.children.map(c=>c.textContent??'').join('');}
  set textContent(v){this._text=String(v);}
}
function find(root,predicate){
  if(predicate(root))return root;
  for(const c of root.children??[]){
    const f=find(c,predicate);
    if(f)return f;
  }
  return null;
}
function renderTerm(id){
  const existingNode=globalThis.Node,existingDocument=globalThis.document;
  try{
    globalThis.Node=NodeStub;
    globalThis.document={
      createElement:tag=>new NodeStub(tag),
      createElementNS:(_ns,tag)=>new NodeStub(tag),
      createTextNode:value=>{const x=new NodeStub('#text');x.textContent=value;return x;},
    };
    const lesson=lessonById('ma'),state=createLessonState('ma');
    return topicPage(lesson,state,lessonSnapshot(state),'overview',id,false,0,id).node;
  } finally {
    globalThis.Node=existingNode;
    globalThis.document=existingDocument;
  }
}
test('rendered click-open panel uses existing RAIL_COMPONENTS definition and source',()=>{
  const root=renderTerm('rbc');
  const term=find(root,n=>n.attrs?.['data-glossary-term']==='rbc');
  assert.ok(term,'RBC button exists');
  assert.equal(term.attrs['aria-expanded'],'true');
  assert.equal(term.attrs['aria-controls'],'topic-term-definition');
  assert.equal(term.attrs.title,undefined,'no native hover title');
  const panel=find(root,n=>n.attrs?.id==='topic-term-definition');
  assert.ok(panel,'floating panel exists');
  assert.equal(panel.attrs.hidden,undefined,'opened panel not hidden');
  assert.match(panel.textContent,/Radio Block Centre/);
  assert.match(panel.textContent,/SUBSET-026/);
  const close=find(panel,n=>n.attrs?.['data-action']==='close-term-definition');
  assert.ok(close,'explicit close button exists');
});
test('glossary popup starts closed, rather than opening on hover or focus',()=>{
  const root=renderTerm('');
  const term=find(root,n=>n.attrs?.['data-glossary-term']==='rbc');
  const panel=find(root,n=>n.attrs?.id==='topic-term-definition');
  assert.equal(term.attrs['aria-expanded'],'false');
  assert.equal(panel.attrs.hidden,'','hidden attribute present before click');
  assert.equal(term.attrs.title,undefined);
});
