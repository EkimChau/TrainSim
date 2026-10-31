/* Simulator Mode presentation; all visible values are projections from
 * simulator/world.js and the authored Lesson 009 reducer. No rules here. */
import {el} from '../../api.js';
import {SIMULATOR_COMPONENTS,SIMULATOR_SCENARIOS,TRACK_WORLD,
  componentReadings,simScenario,simulatorSummary,hasNextSimulatorStep} from './world.js';
import {renderRailWorld} from './vector.js';
const t=(name,value,cls)=>el(name,cls?{class:cls}:{},String(value));
const b=(value,attrs={})=>el('button',{type:'button',...attrs},value);
const fmt=value=>value===undefined||value===null?'—':String(value);
function metric(label,value,tone=''){
  return el('div',{class:'sim-meter'+(tone?' sim-'+tone:'')},
    t('dt',label),t('dd',fmt(value)));
}
function dmiSpeed(speed){
  const NS='http://www.w3.org/2000/svg';
  const s=(name,attrs={},content)=>{
    const e=document.createElementNS(NS,name);
    for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
    if(content!==undefined)e.textContent=String(content);
    return e;
  };
  const root=s('svg',{viewBox:'0 0 214 190',class:'sim-speed-svg',role:'img',
    'aria-label':'Illustrative DMI speedometer '+speed+' kilometres per hour'});
  root.append(s('path',{d:'M33 143 A80 80 0 1 1 181 143',fill:'none',stroke:'#50677b','stroke-width':12}));
  for(let v=0;v<=160;v+=20){
    const theta=(-220+(v/160)*260)*Math.PI/180;
    const x=107+78*Math.cos(theta),y=105+78*Math.sin(theta);
    const xx=107+63*Math.cos(theta),yy=105+63*Math.sin(theta);
    root.append(s('line',{x1:x,y1:y,x2:xx,y2:yy,stroke:'#c5d7e7','stroke-width':2}));
    root.append(s('text',{x:107+48*Math.cos(theta),y:108+48*Math.sin(theta),
      'text-anchor':'middle',fill:'#d5e6ec','font-size':9},v));
  }
  const num=s('text',{x:107,y:113,'text-anchor':'middle',fill:'#f4f8fd','font-size':39,
    'font-family':'system-ui','font-weight':800},speed);
  const unit=s('text',{x:107,y:135,'text-anchor':'middle',fill:'#cbdfed','font-size':12},'km/h');
  root.append(num,unit);
  return root;
}
export function dmiInstrument(world){
  const a=world.trains[0];
  const dist=world.ma.end===null?'—':Math.max(0,world.ma.end-a.position)+' m';
  const readings=[
    ['Permitted speed','not modelled'],['Target speed','not modelled'],
    ['Distance to EOA',dist],['Train level',a.level],
    ['Mode',a.mode],['Radio session',world.rbc.session],
    ['RBC reported front',world.rbc.report?world.rbc.report.front+' m':'not received'],
    ['LRBG',a.lrbg||'not acquired']
  ];
  return el('section',{class:'sim-dmi-box','aria-label':'Modern ETCS-inspired training DMI'},
    el('div',{class:'sim-dmi-heading'},t('strong','DRIVER–MACHINE INTERFACE'),
      t('span','FICTIONAL TRAINING INSTRUMENT · NOT AN OPERATIONAL DMI')),
    el('div',{class:'sim-dmi-content'},
      el('div',{class:'sim-speed-panel'},dmiSpeed(a.speed),t('small','ESTIMATED SPEED · FIXTURE')),
      el('dl',{class:'sim-dmi-readings'},...readings.map(([label,value])=>metric(label,value))),
      el('div',{class:'sim-ma-column'},
        t('small','MOVEMENT AUTHORITY'),t('strong',world.ma.status),
        el('div',{class:'sim-ma-scale','data-issued':String(world.ma.end!==null)},
          el('span',{class:'sim-ma-train'},'🚆'),el('span',{class:'sim-ma-end'},'EOA')),
        t('small','Proposed end — '+(world.ma.end===null?'not supplied':world.ma.end+' m')),
        t('small','Supervision: not implemented'))),
    t('p','DMI visualises training events; speeds, brake curves, real ETCS modes and intervention thresholds are not implemented.','sim-dmi-footnote'));
}
function componentList(world,selected){
  return el('section',{class:'sim-component-list', 'aria-label':'Reusable vector component instruments'},
    t('h2','Live component instruments'),
    t('p','Select a sensor, train, signal or control system to inspect its state.','sim-small'),
    el('div',{class:'sim-component-grid'},
      ...SIMULATOR_COMPONENTS.map(item=>{
        const reading=componentReadings(world,item.id);
        return b(el('span',{},t('strong',item.id),t('small',reading.status)),{
          class:'sim-component-button'+(selected===item.id?' current':''),
          'data-sim-component':item.id,'aria-pressed':String(selected===item.id),
          title:item.label
        });
      })));
}
function inspector(world,selected){
  const component=SIMULATOR_COMPONENTS.find(c=>c.id===selected)||SIMULATOR_COMPONENTS[0];
  const reading=componentReadings(world,component.id);
  return el('section',{class:'sim-selected-instrument','aria-live':'polite'},
    t('small','SELECTED VECTOR COMPONENT','sim-eyebrow'),
    t('h2',component.label),t('p',component.kind.toUpperCase()+' / '+reading.status,'sim-component-status'),
    el('dl',{class:'sim-inspector-table'},
      ...reading.readings.map(([name,value])=>metric(name,value))),
    t('p','Reference: '+component.source,'sim-small'));
}
function timeline(world){
  const scenario=simScenario(world.scenarioId);
  return el('section',{class:'sim-timeline','aria-label':'Scenario event sequence'},
    t('h2','Animation sequence · '+scenario.label),
    t('p',scenario.description,'sim-small'),
    el('ol',{class:'sim-timeline-steps'},
      ...scenario.steps.map((step,i)=>el('li',{class:
        'sim-timeline-step'+(i<world.step?' complete':'')+(i===world.step?' next':'')},
        el('span',{class:'sim-step-num'},String(i+1)),
        t('span',step.label),
        t('small',step.kind.replaceAll('-',' '))))));
}
function log(world){
  return el('section',{class:'sim-event-log'},t('h2','Event trace · logical ticks'),
    el('ol',{role:'log','aria-label':'Simulator event trace',class:'sim-event-entries'},
      ...world.events.slice(-16).map(event=>
        el('li',{'data-tone':event.state},
          t('span','#'+String(event.tick).padStart(2,'0')+' '+event.actor),
          t('span',event.message)))));
}
function intro(lesson,world,playing,rate=1){
  const scenario=simScenario(world.scenarioId);
  return el('div',{class:'sim-header-block'},
    el('nav',{class:'sim-nav'},b('‹ Back to Lesson '+lesson.number,{
      class:'sim-back','data-sim-action':'back'}),
      t('span','LESSONS / SIMULATOR MODE / '+lesson.number,'sim-eyebrow')),
    t('small','VECTOR TRAINING WORLD · FIXTURE v1','sim-eyebrow'),
    t('h1','Lesson '+lesson.number+' ▾ — '+lesson.title),
    t('p','Trackside components, point interlocking, balise detection, train position reports and a simulated RBC boundary — with shared vector instruments.','sim-intro'),
    el('div',{class:'sim-controls'},b(playing?'Ⅱ Pause':'▶ Simulate',{
      class:'sim-primary','data-sim-action':'play','aria-pressed':String(playing)}),
    b('Step →',{'data-sim-action':'step',disabled:playing||!hasNextSimulatorStep(world)}),
    b('← Back step',{'data-sim-action':'previous',disabled:playing||world.step===0}),
    b('↺ Reset',{'data-sim-action':'reset'}),
    el('span',{class:'sim-step-counter'},world.step+'/'+scenario.steps.length+' events · playback'),
    ...[1,2,4].map(v=>b(v+'×',{'data-sim-rate':String(v),
      class:'sim-rate-button'+(rate===v?' current':''),
      'aria-pressed':String(rate===v),title:'Animation playback speed '+v+' times'})),
    ...SIMULATOR_SCENARIOS.map(item=>b(item.label,{
      class:'sim-scenario-button'+(item.id===world.scenarioId?' current':''),
      'data-sim-scenario':item.id,'aria-pressed':String(item.id===world.scenarioId)}))));
}
export function simulatorPage(lesson,world,selected='IXL',playing=false,rate=1){
  const summary=simulatorSummary(world);
  return el('div',{class:'sim-book'},
    intro(lesson,world,playing,rate),
    el('section',{class:'sim-world-card'},t('h2','Lesson world — synthetic junction, two trains, RBC interface'),
      el('div',{class:'sim-world-viewport'},renderRailWorld(world,selected)),
      t('p','Blue dashed = radio information bearer; green = route proof/clear; red = occupancy/stop. Positions are synthetic metres, not surveyed geography.','sim-small')),
    el('div',{class:'sim-grid-primary'},
      el('div',{class:'sim-instrument-column'},
        dmiInstrument(world),timeline(world)),
      el('div',{class:'sim-inspector-column'},
        componentList(world,selected),inspector(world,selected))),
    el('div',{class:'sim-grid-secondary'},
      el('section',{class:'sim-lesson-proof'},
        t('h2','Lesson 009 · authoritative teaching reducer'),
        t('p','The existing authored IXL evaluator decides whether the illustrative route preconditions pass. The visual world does not replace that evaluator.','sim-small'),
        el('dl',{class:'sim-proof-data'},...summary.lesson.stats.slice(0,6).map(m=>metric(m.label,m.value))),
        t('p',summary.lesson.reason,'sim-small')),
      log(world)),
    el('details',{class:'sim-sources'},
      el('summary',{},'Specification boundary & drawing conventions'),
      t('p','Interlocking is external to SUBSET-026 under Chapter 2 §2.4.1.3(d). Train position reporting and radio/RBC concepts are covered by SUBSET-026 Chapters 3 and 8. Full mode and level transitions require the actual Chapter 4/5 conditions.','sim-small'),
      el('p',{},'The RBC receives an OBU position report via radio; the radio mast does not measure train location. The route proof, points, train movement, illustrated MA and levels are synthetic demonstration events only.'),
      t('p','All symbols are internally consistent original SVG artwork, not approved national control-table drawings or certified ETCS DMI layouts.','sim-small')));
}


/** Patch only instruments during motion; the SVG train stays in its own live
 * transform layer and a full rerender occurs only at the final scenario event.
 */
export function refreshSimulatorReadings(host,world,selected='IXL'){
  const swap=(selector,create)=>{
    const old=host.querySelector(selector);
    if(old)old.replaceWith(create());
  };
  swap('.sim-dmi-box',()=>dmiInstrument(world));
  swap('.sim-component-list',()=>componentList(world,selected));
  swap('.sim-selected-instrument',()=>inspector(world,selected));
  swap('.sim-event-log',()=>log(world));
}
