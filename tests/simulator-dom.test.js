import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonById} from '../src/client/tutorials/lessons.js';
import {FIRST_SIM_LESSON,createSimulatorWorld,simulateNextStep} from
  '../src/client/tutorials/simulator/world.js';
import {motionFrame} from '../src/client/tutorials/simulator/motion.js';
import {simulatorPage,refreshSimulatorReadings} from '../src/client/tutorials/simulator/view.js';
import {renderRailWorld,refreshRailDetectors} from '../src/client/tutorials/simulator/vector.js';

/**
 * A tiny DOM test double sufficient for SVG construction and card refresh,
 * avoiding a browser dependency. Browser screenshots are a separate acceptance
 * check; this verifies that code really builds reusable interactive DOM nodes.
 */
class FakeNode{
  constructor(tag,text=''){this.tag=tag;this.attrs={};this.children=[];this.parent=null;this.ownText=String(text);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  get className(){return this.attrs.class??'';}
  set className(v){this.attrs.class=String(v);}
  set textContent(v){this.children=[];this.ownText=String(v);}
  get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
  append(...values){for(const item of values){
    const node=item instanceof FakeNode?item:new FakeNode('#text',item);
    node.parent=this;this.children.push(node);
  }}
  replaceWith(newNode){
    if(!this.parent)return;
    const pos=this.parent.children.indexOf(this);
    if(pos<0)return;
    newNode.parent=this.parent;this.parent.children[pos]=newNode;this.parent=null;
  }
  matches(selector){
    if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
    const attribute=selector.match(/^\[([a-z0-9-]+)="([^"]*)"\]$/i);
    if(attribute)return this.getAttribute(attribute[1])===attribute[2];
    return this.tag===selector;
  }
  descendants(){return this.children.flatMap(c=>[c,...c.descendants()]);}
  querySelector(selector){
    const parts=selector.trim().split(/\s+/);
    const candidates=this.descendants().filter(x=>x.matches(parts[0]));
    if(parts.length===1)return candidates[0]||null;
    for(const c of candidates){
      const nested=c.querySelector(parts.slice(1).join(' '));
      if(nested)return nested;
    }
    return null;
  }
}
globalThis.Node=FakeNode;
globalThis.document={
  createElement:tag=>new FakeNode(tag),
  createElementNS:(_,tag)=>new FakeNode(tag),
  createTextNode:text=>new FakeNode('#text',text)
};
const lesson=lessonById(FIRST_SIM_LESSON);
const progress=(n,world=createSimulatorWorld(lesson))=>{
  for(let i=0;i<n;i++)world=simulateNextStep(world,lesson);
  return world;
};

test('Lesson 009 creates a full SVG, vector equipment and accessible selectable components',()=>{
  const root=renderRailWorld(createSimulatorWorld(lesson),'IXL');
  assert.equal(root.tag,'svg');
  assert.ok(root.descendants().filter(n=>n.tag==='symbol').length>=7);
  assert.ok(root.descendants().filter(n=>n.tag==='use').length>=12);
  for(const id of ['TC1','TC2','BG-1','BG-2','P1','IXL','RBC','DMI','BTM','ODOM','train-A','train-B']){
    const component=root.querySelector('[data-sim-component="'+id+'"]');
    assert.ok(component,id+' was not drawn');
    assert.equal(component.getAttribute('role'),'button',id+' should be keyboard selectable');
  }
  assert.ok(root.textContent.includes('NOT CERTIFIED'));
});

test('full simulator page builds live DMI, controls, scenario choices and event trace',()=>{
  const world=progress(6),page=simulatorPage(lesson,world,'RBC',false,2);
  assert.equal(page.className,'sim-book');
  assert.ok(page.querySelector('.sim-world-svg'));
  assert.ok(page.querySelector('.sim-dmi-box'));
  assert.ok(page.querySelector('.sim-component-list'));
  assert.ok(page.querySelector('.sim-selected-instrument').textContent.includes('Reported front'));
  assert.ok(page.querySelector('.sim-event-log').textContent.includes('RBC'));
  assert.ok(page.textContent.includes('2×'));
  assert.ok(page.textContent.includes('not modelled'));
  assert.ok(page.textContent.includes('FICTIONAL TRAINING INSTRUMENT'));
});

test('during movement the SVG sensors and HTML instruments refresh from the same in-motion world',()=>{
  const before=progress(3),after=simulateNextStep(before,lesson);
  const halfway=motionFrame(before,after,0.4);
  const past=motionFrame(before,after,0.96);
  const host=new FakeNode('main');
  host.append(simulatorPage(lesson,before,'BG-1'));
  refreshRailDetectors(host,halfway,'BG-1');
  refreshSimulatorReadings(host,halfway,'BG-1');
  assert.ok(host.querySelector('.sim-selected-instrument').textContent.includes('pending'));
  assert.ok(host.querySelector('[data-sim-component="BG-1"]').textContent.includes('BG-1'));
  refreshRailDetectors(host,past,'BG-1');
  refreshSimulatorReadings(host,past,'BG-1');
  assert.ok(host.querySelector('.sim-selected-instrument').textContent.includes('detected'));
  assert.ok(host.querySelector('.sim-dmi-box').textContent.includes('BG-1'));
  assert.ok(host.querySelector('.sim-event-log').textContent.includes('BTM'));
});
