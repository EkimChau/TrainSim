/* A reusable source-linked visual legend for all lesson families.
 * This is the teaching projection of the lesson reducer, not a second model.
 */
import {el} from '../api.js';
import {TOPICS,RAIL_COMPONENTS,componentById,topicById,buildTopicScene,topicSimulation} from './topics.js';
import {railwayDiagram} from './topic-diagram.js';

const t=(tag,value,cls)=>el(tag,cls?{class:cls}:{},String(value));
const button=(label,attrs={})=>el('button',{type:'button',...attrs},label);
const value=(n,unit)=>n===null||n===undefined?'not supplied':String(n)+(unit?' '+unit:'');
const action=(item)=>button(item.label,{class:'topic-lesson-action','data-command':item.id,title:item.help||item.label});

export function topicPicker(active=''){
  return el('details',{class:'paper-topic-picker'},
    el('summary',{title:'Open the reusable railway concepts and diagrams'},'Topics ▾'),
    el('div',{class:'paper-topic-menu',role:'group','aria-label':'Tutorial topic titles'},
      ...TOPICS.map(item=>button(item.title,{
        'data-open-topic':item.id,
        class:'paper-topic-menu-item'+(active===item.id?' current':''),
        'aria-current':active===item.id?'page':'false'
      }))));
}

function device(scene){
  const speed=value(scene.actualSpeed,'km/h');
  const permitted=value(scene.permittedSpeed,'km/h');
  const distance=scene.maEndProvided?value(Math.max(0,scene.maEnd-scene.front),'m'):'not provided';
  const range=scene.maEndProvided?scene.maType+' · '+scene.maEnd+' m':'no lesson authority end';
  const metrics=[
    ['Estimated speed',speed],['Current permitted',permitted],
    ['Authority end',range],['Distance to end',distance],
    ['Target at end',scene.maEndProvided?value(scene.targetSpeed,'km/h'):'not provided'],
    ['Operating mode',scene.mode]
  ];
  return el('section',{class:'topic-dmi','aria-label':'Illustrative driver-machine interface'},
    el('div',{class:'topic-dmi-housing'},
      el('header',{class:'topic-dmi-header'},t('b','ETCS · DMI teaching mock'),t('span','SIMWORLD / NON-CERTIFIED')),
      el('div',{class:'topic-dmi-banner','data-warning':String(scene.warning)},
        t('strong',scene.phase.replaceAll('_',' ')),t('span',scene.status)),
      el('div',{class:'topic-dmi-speed'},
        el('div',{},t('small','SPEED'),t('strong',scene.actualSpeed===null?'—':scene.actualSpeed),t('small','km/h')),
        el('div',{},t('small','PERMITTED'),t('strong',scene.permittedSpeed===null?'—':scene.permittedSpeed),t('small','km/h'))),
      el('dl',{class:'topic-dmi-grid'},...metrics.map(([label,reading])=>
        el('div',{},t('dt',label),t('dd',reading)))),
      t('p','Mock interface only · not the standard ETCS DMI layout or a driving instruction.','topic-dmi-caveat')),
    t('p','All fields above come from the same lesson inputs and state projection as the tutorial. Missing data stays marked unavailable.','topic-small'));
}
function glossary(scene,selected){
  const visible=[...scene.parts,...RAIL_COMPONENTS.map(c=>c.id).filter(id=>!scene.parts.includes(id))];
  return el('section',{class:'topic-glossary', 'aria-label':'Click to identify railway components'},
    t('h2','Railway legend'),
    t('p','Select a labelled item on the track diagram or in this legend. Highlighted items are part of this topic.','topic-small'),
    el('div',{class:'topic-legend-grid'},...visible.map(id=>{
      const item=componentById(id);
      return button(item.term,{class:'topic-legend-item'+(scene.parts.includes(id)?' relevant':'')+
          (scene.highlightedParts.includes(id)?' active-event':'')+(id===selected?' selected':''),
        'data-component':id,'aria-pressed':String(id===selected),title:item.label+' — '+item.place});
    })));
}
function inspector(scene,id){
  const component=componentById(id)||componentById(scene.parts[0]);
  const localInputs=scene.relevantInputs.length?scene.relevantInputs.join(', '):'No matching value fields supplied';
  return el('section',{class:'topic-inspector','aria-live':'polite'},
    t('small','SELECTED COMPONENT','topic-eyebrow'),
    t('h2',component.label),t('strong',component.term,'topic-abbr'),
    el('dl',{class:'topic-definition'},
      el('div',{},t('dt','Where'),t('dd',component.place)),
      el('div',{},t('dt','Role'),t('dd',component.description)),
      el('div',{},t('dt','Source'),t('dd',component.source))),
    t('p','Lesson fields: '+localInputs,'topic-small'));
}
function sourceInfo(scene,lesson){
  return el('details',{class:'topic-references'},
    el('summary',{},'Source references and model boundaries'),
    t('p',lesson.boundary||'Educational re-expression of the referenced technical requirements.','topic-small'),
    el('ul',{},...scene.references.map(ref=>el('li',{},ref))),
    scene.docsRecord?t('p','Documentation record: '+scene.docsRecord.id+' · '+scene.docsRecord.status,'topic-small'):null,
    t('p','Visual metre coordinates and railway furniture are SimWorld fixtures unless a lesson explicitly supplies their input; neither geometry nor changing screens proves compliance.','topic-small'));
}
export function topicPage(lesson,state,snapshot,id,selected,playing=false,stepIndex=0){
  const scene=buildTopicScene(lesson,state,snapshot,id);
  const active=topicById(id);
  const chosen=componentById(selected)?selected:scene.parts[0];
  const scenario=topicSimulation(lesson);
  return {scene,node:el('div',{class:'topic-book'},
    el('nav',{class:'topic-page-top','aria-label':'Topic navigation'},
      button('‹  Back to Lesson '+lesson.number,{class:'topic-back','data-action':'back-lesson','aria-label':'Return to Lesson '+lesson.number}),
      el('span',{class:'topic-breadcrumb'},'Lesson '+lesson.number+' / Concepts'),topicPicker(id)),
    el('header',{class:'topic-page-header'},
      t('small','TUTORIAL TOPICS · RAILWAY FIELD GUIDE','topic-eyebrow'),t('h1',active.title),
      t('p',active.description,'topic-intro'),
      el('div',{class:'topic-topic-strip'},t('span','Lesson '+lesson.number+' · '+lesson.short),
        t('span','SUBSET-026 v'+scene.sourceIndexVersion),t('span','Schematic / not to scale'))),
    el('div',{class:'topic-top-grid'},
      el('section',{class:'topic-rail-card'},t('h2','Train and trackside model'),
        el('div',{class:'topic-simulator-actions'},
          button(playing?'Ⅱ Pause simulation':'▶ Simulate lesson loop',{
            class:'topic-primary','data-action':'topic-simulate','aria-pressed':String(playing)}),
          button('Step →',{'data-action':'topic-step',disabled:playing}),
          button('↺ Reset',{'data-action':'topic-reset'}),
          t('span',scenario?'Example: '+scenario.label+' · step '+stepIndex+'/'+scenario.steps.length:'No replay fixture','topic-small')),
        el('div',{class:'topic-diagram-box'},railwayDiagram(scene,chosen)),
        t('p','Blue dotted = proposed authority; solid green = issued in this teaching state. A passing balise highlights when the train front approaches its fixture position.','topic-small'),
        sourceInfo(scene,lesson)),
      el('aside',{class:'topic-cab-card'},t('h2','View from the driver cab'),device(scene))),
    el('div',{class:'topic-bottom-grid'},
      glossary(scene,chosen),
      inspector(scene,chosen),
      el('section',{class:'topic-actions-card'},t('h2','Lesson controls & system response'),
        t('p','These are training scenario commands, not physical cab controls. They operate the existing lesson state machine.','topic-small'),
        el('div',{class:'topic-command-grid'},...lesson.actions.map(action)),
        t('h3','Latest observed result'),
        el('div',{class:'topic-result','data-warning':String(scene.warning)},snapshot.reason),
        el('dl',{class:'topic-metrics'},...snapshot.stats.slice(0,6).map(m=>
          el('div',{},t('dt',m.label),t('dd',m.value)))))),
    t('p','Only source-linked terminology is presented as standard-defined. The moving train, placements, colours, timing and simplified DMI are illustrative SimWorld training fixtures.','topic-disclaimer')
  )};
}
