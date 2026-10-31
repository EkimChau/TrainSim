/**
 * Data-driven ESIG learning re-expressions indexed from nine user-supplied
 * SUBSET-026 v4.0.0 chapter PDFs. Models are synthetic demonstrations:
 * no SRS curve, timing, messages or safety function is being certified.
 */
import {COURSE_SOURCE,FAMILY_SPEC} from './course-source.js';

export const COURSE_MODULES=COURSE_SOURCE.modules;
export const COURSE_FIGURES=COURSE_SOURCE.figures;
export const COURSE_META=COURSE_SOURCE.metadata;
export const DIFFICULTIES=[
  {id:'simple',label:'Simple',description:'One function. Normal and single-fault input/output.',vectors:1},
  {id:'medium',label:'Medium',description:'Sequential transitions, revised values and dependent signals.',vectors:3},
  {id:'busy',label:'Busy',description:'Compound, same-tick fault vectors; recheck, recovery and multiple events.',vectors:5},
];
const chapterRef=ch=>`SUBSET-026-${ch} v4.0.0`;
const titleOf=l=>l.title.replace(/\s+/g,' ').replace(/\.+$/,'').trim();
const toId=str=>str.replace(/[^A-Za-z_0-9]/g,'_').toUpperCase();
const titleCase=str=>str.toLowerCase().replace(/(^|_|\s)([a-z])/g,(_,a,b)=>`${a==='_'?' ':a}${b.toUpperCase()}`);
const bool=id=>({[id]:false});
function faultVector(lesson){
  const f=FAMILY_SPEC[lesson.family];const field=f.inputs.find(i=>i[0]===f.fault);
  return {[f.fault]:field[2]==='boolean'?false:field[0]==='permitted'?35:field[0]==='speed'?165:0};
}
function anotherFault(lesson){
  const spec=FAMILY_SPEC[lesson.family];const first=spec.fault;
  const extra=spec.inputs.find(f=>f[2]==='boolean'&&f[0]!==first);
  return extra?bool(extra[0]):changedNumber(lesson);
}
function changedNumber(lesson){
  if(lesson.family==='version')return {operatedVersion:4,supportedVersion:4};
  const spec=FAMILY_SPEC[lesson.family];
  const field=spec.inputs.find(f=>f[2]==='number'&&f[0]!==spec.fault&&f[0]!=='maLimit'&&f[0]!=='targetSpeed'&&f[0]!=='targetAtEnd');
  if(!field)return {};
  const old=Number(field[3]);
  const max=field[6]??old+100;
  const min=field[5]??0;
  const delta=old>0?Math.min(25,old*0.15):4;
  return {[field[0]]:Math.max(min,Math.min(max,Math.round((old+delta)*100)/100))};
}
function scenarios(l){
  const a=faultVector(l),b=anotherFault(l),v=changedNumber(l);
  const variation=Object.keys(v).length?[{set:v},{action:'evaluate'},{action:'progress'}]:
    [{set:a},{action:'evaluate'},{action:'restore'},{action:'evaluate'},{action:'progress'}];
  const thirdVector=Object.keys(v).length?v:Object.keys(b).length?b:a;
  return [
    {id:'simple-normal',tier:'simple',label:'Normal input → output',kind:'ok',
      steps:[{action:'evaluate'}],expect:{phase:'ACTIVE'}},
    {id:'simple-fault',tier:'simple',label:'One missing condition',kind:'alert',
      steps:[{set:a},{action:'evaluate'}],expect:{phase:'BLOCKED'}},
    {id:'medium-sequence',tier:'medium',label:'Complete the sequence',kind:'ok',
      steps:[{action:'evaluate'},{action:'progress'},{action:'progress'}],expect:{phase:'COMPLETE'}},
    {id:'medium-variation',tier:'medium',label:'Change parameter and re-evaluate',kind:'ok',
      steps:variation,expect:{phase:'PROGRESS'}},
    {id:'busy-compound',tier:'busy',label:'Multiple faults and recovery',kind:'alert',
      steps:[{action:'evaluate'},{action:'progress'},
        {burst:[{actor:'Trackside',set:a},{actor:'Independent input',set:b},{actor:'Train/OBU',set:thirdVector}]},
        {action:'evaluate'},{action:'restore'},{action:'evaluate'},{action:'progress'}],
      expect:{phase:'PROGRESS',mustVisit:['REVIEW','BLOCKED']}},
    {id:'busy-cascade',tier:'busy',label:'Fault cascade + rerun',kind:'alert',
      steps:[{burst:[{actor:'Trackside',set:a},{actor:'Second subsystem',set:b}]},
        {action:'evaluate'},{action:'restore'},...(Object.keys(v).length?[{set:v}]:[]),{action:'evaluate'},
        {action:'progress'},{action:'progress'}],expect:{phase:'COMPLETE',mustVisit:['BLOCKED']}},
  ];
}
function figuresFor(source){return source.figures.map(id=>COURSE_FIGURES.find(f=>f.id===id)).filter(Boolean);}
function graphicalModel(lesson,actors){
  const a=actors.slice(0,4).map((label,i)=>({id:`actor${i}`,text:label,tag:i===0?'input':i===actors.length-1?'output':'process',x:8+i*180,y:70}));
  const arrows=a.slice(1).map((item,i)=>[a[i].id,item.id]);
  const flow='flowchart LR\n  '+a.map((item,i)=>`${toId(item.id)}[${item.text.replace(/[|<>]/g,'')}]${i+1<a.length?' --> ':''}`).join('');
  const state=`stateDiagram-v2\n  [*] --> IDLE\n  IDLE --> ACTIVE: conditions accepted\n  IDLE --> BLOCKED: preconditions fail\n  ACTIVE --> PROGRESS: event handled\n  PROGRESS --> COMPLETE: terminal event\n  ACTIVE --> REVIEW: inputs changed\n  REVIEW --> BLOCKED: evaluate failure\n  BLOCKED --> RECOVERED: restore inputs\n  RECOVERED --> ACTIVE: re-evaluate`;
  return {flow,state,actors:a,arrows,stages:['IDLE','ACTIVE','PROGRESS','COMPLETE','BLOCKED','REVIEW','RECOVERED']};
}
export const GENERATED_LESSONS=COURSE_SOURCE.lessons.map((src,index)=>{
  const family=FAMILY_SPEC[src.family];
  if(!family)throw new Error('Unknown ESIG lesson family: '+src.family);
  const fields=family.inputs.map(([id,label,kind,def,from,min,max])=>({id,label,kind,default:def,from,unit:kind==='number'?(/speed/i.test(id)?'km/h':/front|limit|distance|position|error/i.test(id)?'m':/gradient/i.test(id)?'‰':id==='deceleration'?'m/s²':id==='buildUp'?'s':''):undefined,min:min??0,max:max??10000,step:kind==='number'?id==='deceleration'?0.1:1:undefined}));
  if(src.packetId!==undefined)fields.unshift({id:'packetId',label:'NID_PACKET (reference)',kind:'number',default:src.packetId,from:chapterRef(7),min:0,max:255,step:1});
  const messageId=src.title.match(/^Message\s+(\d+)\s*:/i);
  if(messageId)fields.unshift({id:'messageId',label:'Message identifier (reference)',kind:'number',default:Number(messageId[1]),from:chapterRef(8),min:0,max:255,step:1});
  const figs=figuresFor(src);
  const lesson={
    id:src.id,number:String(index+4).padStart(3,'0'),title:titleOf(src),short:titleOf(src).slice(0,62),
    icon:src.family==='braking'?'📉':src.family==='position'?'📍':src.family==='packet'||src.family==='message'?'▤':src.family==='mode'?'⇄':'🚦',
    module:src.module,moduleTitle:src.moduleTitle,chapter:src.chapter,clause:src.clause,
    family:src.family,simulation:'teaching_abstraction',
    goal:`Explain ${titleOf(src)} as one explicit input → processing → output function; then challenge its conditions.`,
    summary:`SUBSET-026-${src.chapter} §${src.clause} (p.${src.page}): ${titleOf(src)}. Use the simulated ${family.title.toLowerCase()} to inspect signal origins, state transitions and failures.`,
    boundary:`Fictitious educational model of ${titleOf(src)}. Generic teaching transitions and fixture numbers are NOT the SRS functional algorithm, actual interlocking design, validated brake curves, message encoding, or operational permission. Inspect the cited source before implementing safety behaviour.`,
    source:[`${chapterRef(src.chapter)} §${src.clause}, printed p.${src.page}`,...figs.map(f=>`${chapterRef(src.chapter)} Figure ${f.figure} (p.${f.page}): ${f.caption}`)],
    sourceFigures:figs.map(f=>({id:f.id,figure:f.figure,caption:f.caption,page:f.page,chapter:f.chapter,scope:'illustrative re-expression'})),
    inputs:fields,
    actions:[{id:'evaluate',label:`Evaluate ${family.title}`,tone:'blue',help:'Inspect source and model preconditions'},
      {id:'progress',label:'Process next event',tone:'green',help:'Advance this teaching function by one event'},
      {id:'disrupt',label:'Inject failure',tone:'red',help:'Change the principal safety/relevance input'},
      {id:'restore',label:'Restore conditions',tone:'neutral',help:'Restore default parameters, then reevaluate'},
      {id:'reset',label:'Reset lesson',tone:'neutral',help:'Clear recorded training state'}],
    diagrams:graphicalModel(src,family.actors),
    tiers:DIFFICULTIES,
    familyDescriptor:family.title,
    sourceAnchor:src,
  };
  lesson.scenarios=scenarios(lesson);
  return lesson;
});
export const courseModules=()=>COURSE_MODULES.map(m=>({...m,count:GENERATED_LESSONS.filter(l=>l.module===m.id).length}));
