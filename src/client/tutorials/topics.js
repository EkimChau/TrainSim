/**
 * Railway Topic catalogue and a pure scene projection for SimWorld lessons.
 * Source anchors come from the authored lesson JS records, the generated SRS
 * index and the draft docs/sigreqs metadata. This is illustrative geometry,
 * never an ETCS implementation, a surveyed layout or a DMI specification.
 */
import {COURSE_META} from './curriculum.js';
import {metadata as LEVEL_ENTRY_SPEC} from '../../../docs/sigreqs/sim-run/level-transitions/evaluate-level-entry-sig-subset-026-4-0-0-5-10-3-2-3.js';

export const RAIL_COMPONENTS = Object.freeze([
  {id:'track',label:'Railway track',term:'Track',place:'Track bed',source:'SUBSET-026-2 §2.4',description:'Rails, sleepers and the physical path. A schematic rail axis is used for distance-based examples.'},
  {id:'train',label:'Train and front',term:'Train front',place:'On the rails',source:'SUBSET-026-3 §3.6',description:'The front is the direction-facing end used for illustrative position and authority distances. The rear is separately identified.'},
  {id:'cab',label:'Driver cab',term:'Driving desk',place:'Leading end of train',source:'SUBSET-026-2 §2.4.1.3(b); SUBSET-026-5 §5.4',description:'Where the driver operates the train and interacts with the onboard equipment. The screen below is a mock DMI.'},
  {id:'dmi',label:'Driver–Machine Interface',term:'DMI',place:'Inside driver cab',source:'SUBSET-026-4 §4.7',description:'Displays operational information and prompts. The teaching mockup is deliberately not an official DMI screen.'},
  {id:'obu',label:'ETCS onboard unit',term:'OBU',place:'Inside train',source:'SUBSET-026-2 §2.5.2',description:'The onboard ETCS subsystem evaluates trackside information, localisation and supervision.'},
  {id:'antenna',label:'Balise transmission antenna',term:'BTM / antenna',place:'Under train body',source:'SUBSET-026-2 §2.5.2; SUBSET-026-3 §3.4',description:'The under-train receiving equipment detects balise telegrams as the train passes a balise group.'},
  {id:'balise',label:'Eurobalise group',term:'BG',place:'Between rails',source:'SUBSET-026-2 §2.5.1.2; SUBSET-026-3 §3.4.1',description:'One or more balises form a group transmitting location-referenced telegrams. Positions here are synthetic fixtures.'},
  {id:'lrbg',label:'Last Relevant Balise Group',term:'LRBG',place:'Last applicable reference on track',source:'SUBSET-026-3 §§3.4.2, 3.6.1–3.6.5',description:'A location reference used by the onboard position function. The highlighted preceding group is an illustrative reference.'},
  {id:'radio',label:'Radio network / mast',term:'GSM-R / FRMCS',place:'Trackside radio coverage',source:'SUBSET-026-2 §2.5.1.1(c); SUBSET-026-3 §3.5',description:'Communication bearer between train and trackside. The mast icon represents network infrastructure; not every site requires this shape.'},
  {id:'rbc',label:'Radio Block Centre',term:'RBC',place:'Trackside control systems',source:'SUBSET-026-2 §2.5.1.1(d); SUBSET-026-3 §3.8',description:'Trackside ETCS function exchanging train-control information over a safe communication connection.'},
  {id:'ixl',label:'Interlocking',term:'IXL',place:'External trackside system',source:'SUBSET-026-2 §2.4.1.3(d)',description:'External railway system that manages route setting and locking. Route-proving rules in this tutorial are synthetic, not specified by SUBSET-026.'},
  {id:'signal',label:'Lineside signal',term:'Signal',place:'Beside track',source:'SUBSET-026-2 §2.6',description:'An illustrative lineside signal. Its indication is schematic and is not interchangeable with ETCS movement authority.'},
  {id:'point',label:'Point / switch',term:'Point',place:'Track junction',source:'SUBSET-026-2 §2.4.1.3(d)',description:'Track switch providing a selectable route. The teaching icon shows its relative position, not a site-specific control table.'},
  {id:'ma',label:'Movement Authority',term:'MA',place:'Along the train route',source:'SUBSET-026-3 §3.8.1–3.8.4',description:'Authorised movement information. For clarity this schematic shades from the current train front to a proposed or issued end; it does not reproduce all MA sections.'},
  {id:'eoa',label:'End of Authority / Limit of Authority',term:'EOA / LOA',place:'At authority limit',source:'SUBSET-026-3 §3.8.1.1',description:'EOA has zero target speed at the limit; LOA has a nonzero target speed. The target speed is not the current permitted speed.'},
  {id:'speed',label:'Speed profile / braking target',term:'SSP / TSR / MRSP',place:'Track and cab',source:'SUBSET-026-3 §§3.11–3.14',description:'Track restrictions and train data inform supervision. The diagram does not calculate certified braking curves.'},
  {id:'mode',label:'ETCS level and operating mode',term:'Level / Mode',place:'Onboard and trackside',source:'SUBSET-026-2 §2.6; SUBSET-026-4 §§4.4–4.7',description:'Application levels define system communication contexts; modes describe onboard operating conditions. The two are distinct.'}
]);

export const TOPICS = Object.freeze([
  {id:'overview',title:'Railway system at a glance',short:'Railway anatomy',description:'Find the train, balises, radio network, route-control equipment and cab before introducing movement.',parts:['track','train','cab','dmi','obu','antenna','balise','radio','rbc','ixl','signal','point','ma','eoa'],sources:['SUBSET-026-2 §§2.4–2.5']},
  {id:'balises',title:'Balise groups and train detection',short:'Balises & linking',description:'Watch the antenna pass fixed balise groups, then identify linking, reference and reporting relationships.',parts:['track','train','antenna','balise','lrbg','obu'],sources:['SUBSET-026-3 §§3.4–3.6']},
  {id:'position',title:'Where is the train? LRBG and front',short:'Location & LRBG',description:'Distinguish the train front from the balise reference and the uncertainty in its estimated position.',parts:['track','train','antenna','balise','lrbg','obu','rbc'],sources:['SUBSET-026-3 §3.6']},
  {id:'radio',title:'Radio networks, RBC and onboard messages',short:'RBC & radio',description:'Trace a simplified train-to-trackside connection while a movement authority is considered.',parts:['train','cab','obu','dmi','radio','rbc','balise'],sources:['SUBSET-026-2 §2.5; SUBSET-026-3 §3.5; SUBSET-026-8 §8.7']},
  {id:'authority',title:'Movement Authority, EOA and LOA',short:'MA boundaries',description:'Locate the current front and proposed authority end; see why zero and nonzero end target speeds differ.',parts:['track','train','cab','dmi','obu','rbc','ma','eoa','balise'],sources:['SUBSET-026-3 §3.8.1; SUBSET-026-8 §8.7.2']},
  {id:'route',title:'Trackside signalling, points and interlocking',short:'Route proving',description:'Identify external route controls and the route/authority boundary without implying an IXL standard implementation.',parts:['track','train','ixl','signal','point','rbc','ma'],sources:['SUBSET-026-2 §2.4.1.3(d)']},
  {id:'driver',title:'Inside the cab: speed, targets and decisions',short:'Driver display',description:'Replace the handheld with a persistent mock cab display driven by the current lesson state.',parts:['train','cab','dmi','obu','ma','eoa','speed','mode','radio'],sources:['SUBSET-026-3 §§3.11–3.14; SUBSET-026-4 §4.7']},
  {id:'levels',title:'Levels, modes and level transitions',short:'Levels & modes',description:'See how application levels, operational modes, the driver and trackside data are distinct concepts.',parts:['track','train','cab','dmi','obu','radio','rbc','balise','mode','ma'],sources:['SUBSET-026-2 §2.6; SUBSET-026-4 §4.4; SUBSET-026-5 §5.10']}
]);

export const DEFAULT_RAIL_LAYOUT = Object.freeze({
  min:0,max:1100,trainLength:130,
  baliseGroups:[{id:'BG101',metres:220},{id:'BG102',metres:500},{id:'BG103',metres:780}],
  signalMetres:670,pointMetres:880,
  // Coordinates represent a reusable educational scene, not surveyed track data.
  source:'SimWorld synthetic teaching geometry'
});
export const topicById=id=>TOPICS.find(item=>item.id===id)||TOPICS[0];
export const componentById=id=>RAIL_COMPONENTS.find(item=>item.id===id)||null;

export function suggestedTopic(lesson){
  const key=lesson.authoredRule||lesson.id||lesson.family||'';
  if(/balise-link/.test(key))return 'balises';
  if(/confidence|position-report|position/.test(key))return 'position';
  if(/radio|handover|message|packet/.test(key))return 'radio';
  if(/interlocking|ixl|route/.test(key))return 'route';
  if(/movement-authority|^ma$|authority|emergency/.test(key))return 'authority';
  if(/speed|brake|gradient/.test(key))return 'driver';
  if(/mode|start-mission|level|procedure/.test(key))return 'levels';
  return 'overview';
}

const number=(value,fallback)=>{
  const n=Number(value);
  return value!==''&&value!==null&&value!==undefined&&Number.isFinite(n)?n:fallback;
};
const firstNumeric=(input,fields,fallback)=>{
  for(const id of fields)if(Object.hasOwn(input,id))return number(input[id],fallback);
  return fallback;
};
const hasNumeric=(input,fields)=>fields.some(id=>Object.hasOwn(input,id)&&Number.isFinite(Number(input[id])));
const badPhase=phase=>/BLOCKED|REVIEW|STOP|TRIP|DENIED|FAILED|LOST|WITHHELD/.test(phase);

export function buildTopicScene(lesson,state,snapshot,topicId='overview'){
  const topic=topicById(topicId),inputs=state.inputs||{};
  const frontProvided=hasNumeric(inputs,['front','trainFront','measuredPosition','detectedAt']);
  const front=firstNumeric(inputs,['front','trainFront','measuredPosition','detectedAt'],300);
  const endProvided=hasNumeric(inputs,['end','proposedEnd','maLimit']);
  const proposal=firstNumeric(inputs,['end','proposedEnd','maLimit'],900);
  const maEnd=state.ma?.end??proposal;
  const worldMax=Math.max(DEFAULT_RAIL_LAYOUT.max,Math.ceil((Math.max(front,maEnd)+140)/200)*200);
  const balises=DEFAULT_RAIL_LAYOUT.baliseGroups.map((bg,index)=>({
    ...bg,metres:index===1?firstNumeric(inputs,['expectedAt'],bg.metres):bg.metres
  })).sort((a,b)=>a.metres-b.metres);
  const lrbg=balises.filter(bg=>bg.metres<=front).at(-1)??null;
  const issued=Boolean(state.ma)||(lesson.authoredRule==='movement-authority'&&['ACTIVE','PROGRESS','COMPLETE'].includes(state.phase));
  const target=firstNumeric(inputs,['target','targetSpeed','targetAtEnd'],0);
  const permitted=hasNumeric(inputs,['permitted'])?number(inputs.permitted,0):null;
  const actual=hasNumeric(inputs,['speed'])?number(inputs.speed,0):null;
  const mode=typeof inputs.currentMode==='string'?inputs.currentMode:typeof inputs.requestedMode==='string'?inputs.requestedMode:'not modelled';
  const distinctInputs=Object.keys(inputs).filter(k=>/radio|route|track|front|end|balise|level|speed|mode|position/i.test(k));
  const activeParts=[...new Set(topic.parts)];
  const currentBg=balises.find(bg=>Math.abs(bg.metres-front)<=35)??null;
  // The last actual lesson event determines which components light up.
  // There is no topic-only operational state or duplicated safety decision.
  const event=state.events?.at(-1)??null;
  const actor=String(event?.actor||'').toLowerCase();
  const action=String(event?.action||'').toLowerCase();
  const live=new Set();
  if(/rbc/.test(actor)||/issue|evaluate/.test(action))for(const id of ['rbc','radio','ma','eoa'])live.add(id);
  if(/obu|train|advance|progress/.test(actor+' '+action))for(const id of ['train','antenna','obu','cab','dmi'])live.add(id);
  if(/detect|balise|track/.test(actor+' '+action))for(const id of ['track','balise','lrbg'])live.add(id);
  if(/ixl|interlock|route/.test(actor+' '+action))for(const id of ['ixl','point','signal'])live.add(id);
  if(currentBg)for(const id of ['balise','antenna','lrbg'])live.add(id);
  const fact=key=>snapshot.facts?.find(m=>m.label===key)?.value;
  const minSafe=Number.parseFloat(fact('minSafeFront'));
  const maxSafe=Number.parseFloat(fact('maxSafeFront'));
  const confidence=Number.isFinite(minSafe)&&Number.isFinite(maxSafe)&&maxSafe>=minSafe?
    {min:minSafe,max:maxSafe}:null;
  const references=[...new Set([...topic.sources,...(lesson.source||[]),
    ...(lesson.sourceFigures||[]).slice(0,3).map(f=>'SUBSET-026-'+f.chapter+' Figure '+f.figure+' (p. '+f.page+')'),
    ...(topic.id==='levels'?LEVEL_ENTRY_SPEC.requirements.map(r=>r.documentId+' §'+r.clauseNo+' (draft implementation record)'):[])])];
  return {
    topic,parts:activeParts,lessonId:lesson.id,lessonNumber:lesson.number,
    layout:{...DEFAULT_RAIL_LAYOUT,max:worldMax,baliseGroups:balises},
    front,frontProvided,trainRear:front-DEFAULT_RAIL_LAYOUT.trainLength,
    maEnd,maEndProvided:endProvided,authorityIssued:issued,authorityVisible:activeParts.includes('ma'),
    maType:target===0?'EOA':'LOA',targetSpeed:target,permittedSpeed:permitted,actualSpeed:actual,
    mode,phase:snapshot.phase,warning:badPhase(snapshot.phase),status:snapshot.status,
    facts:snapshot.facts||[],stats:snapshot.stats||[],readerRows:snapshot.readerRows||[],
    currentBg,lrbg,confidence,highlightedParts:[...live],lastEvent:event?.message??null,radioAvailable:inputs.radioSafe??inputs.radio??inputs.radioAvailable??inputs.bearer??null,
    routeProved:inputs.routeProved??inputs.pointProved??inputs.pointDetected??null,
    relevantInputs:distinctInputs,references,sourceIndexVersion:COURSE_META.issue,
    docsRecord:topic.id==='levels'?{id:LEVEL_ENTRY_SPEC.id,status:LEVEL_ENTRY_SPEC.status}:null
  };
}

export function topicSimulation(lesson){
  // Reuse the official lesson teaching reducer/scenarios; never invent
  // a separate behaviour model for the diagram.
  return lesson.scenarios.find(s=>(s.tier??'simple')==='simple'&&s.kind==='ok')
    ??lesson.scenarios.find(s=>s.kind==='ok')??lesson.scenarios[0]??null;
}
