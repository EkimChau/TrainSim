import {lessonById} from './lessons.js';
import {initialCourseState,stepCourseLesson,courseSnapshot} from './course-engine.js';
import {initialAuthoredState,stepAuthoredLesson,authoredSnapshot} from './authored-engine.js';

// A pure deterministic *teaching* state machine; no official-source database calls.
// Source references in lessons.js are not an implementation conformance claim.
const maxEvents=40;
const event=(s,action,message,tone='ink',actor='SimWorld')=>{
  s.sequence+=1;
  s.events=[...s.events,{n:s.sequence,action,message,tone,actor}].slice(-maxEvents);
  s.feedback={message,tone,sequence:s.sequence};
};
const initialInputs=lesson=>Object.fromEntries(lesson.inputs.map(f=>[f.id,f.default]));

export function createLessonState(id='ma'){
  const lesson=lessonById(id);
  if(lesson.authoredRule)return initialAuthoredState(lesson);
  if(lesson.family)return initialCourseState(lesson);
  return {lessonId:lesson.id,inputs:initialInputs(lesson),phase:lesson.id==='radio'?'DISCONNECTED':lesson.id==='interlocking'?'IDLE':'WAITING',
    ma:null,routeLocked:false,occupied:false,session:false,report:null,events:[],sequence:0,feedback:null};
}

function valueFor(field,value){
  if(field.kind==='boolean')return Boolean(value);
  if(field.kind==='text'){
    const result=String(value??'').trim();
    if(!result||result.length>30)throw new Error(`${field.label}: enter 1–30 characters`);
    return result;
  }
  const n=Number(value);
  if(!Number.isFinite(n)||value===''||n<field.min||n>field.max)throw new Error(`${field.label} must be ${field.min}–${field.max}`);
  return n;
}

const maGuards=i=>[
  [i.routeProved,'Route not proved'],[i.sectionClear,'Protected section occupied'],
  [i.positionKnown,'Train location not accepted'],[i.radioSafe,'Safe radio session unavailable'],
  [!i.emergencyReceived,'Emergency stop received']
].filter(([ok])=>!ok).map(([,reason])=>reason);
const routeGuards=i=>[
  [i.pointProved,'Point P1 not detected'],[i.trackClear,'Track T1 occupied'],
  [i.overlapClear,'Overlap unavailable'],[i.flankLocked,'Flank protection missing'],
  [i.conflictFree,'Conflicting route set']
].filter(([ok])=>!ok).map(([,reason])=>reason);

function onSet(s,values){
  const lesson=lessonById(s.lessonId);
  for(const [name,value] of Object.entries(values||{})){
    const field=lesson.inputs.find(f=>f.id===name);
    if(!field)throw new Error('Unknown lesson input: '+name);
    s.inputs[name]=valueFor(field,value);
  }
  const i=s.inputs;
  if(s.lessonId==='ma'){
    if(i.emergencyReceived){s.ma=null;s.phase='STOP_REQUIRED';event(s,'set','Emergency stop delivered to OBU — tutorial movement blocked','danger','OBU');}
    else if(s.ma && (maGuards(i).length||i.front>s.ma.end)){
      // Trackside changes are flagged for human review. We do *not* imply an existing
      // authority has been revoked simply because an input/connection changed.
      s.phase='REVIEW';event(s,'set','Inputs changed after MA issue — new actions blocked; no automatic revocation modelled','danger','RBC');
    }else if(!s.ma)s.phase=maGuards(i).length?'WAITING':'READY';
  }else if(s.lessonId==='interlocking'){
    if(s.routeLocked&&routeGuards(i).length){s.phase='REVIEW';event(s,'set','Route lock retained; changed conditions require investigation','danger','IXL');}
    else if(!s.routeLocked&&s.phase!=='ROUTE_DENIED')s.phase='IDLE';
  }else if(s.lessonId==='radio'){
    if(s.session&&!i.radioAvailable){s.session=false;s.phase='RADIO_LOST';event(s,'set','Radio bearer lost; previous report is historical','danger','Radio');}
  }
}

function maAction(s,action){
  const i=s.inputs;
  if(action==='issue'){
    const missing=maGuards(i);
    if(i.end<=i.front)missing.push('MA end must be ahead of train');
    if(missing.length){
      s.phase='WITHHELD';event(s,action,'MA request withheld: '+missing.join('; '),'danger','RBC');return;
    }
    s.ma={end:i.end,target:i.target,permitted:i.permitted,kind:i.target===0?'EOA':'LOA'};
    s.phase='MA_GRANTED';
    event(s,action,`Message 3 teaching event: ${s.ma.kind} ${i.end} m, target ${i.target} km/h, currently permitted ${i.permitted} km/h`,'ok','RBC');
  }else if(action==='advance'){
    if(!s.ma||s.phase==='REVIEW'||s.phase==='STOP_REQUIRED'||maGuards(i).length){
      event(s,action,'Advance blocked: no usable issued MA or conditions require review','danger','OBU');return;
    }
    const next=Math.min(i.front+100,s.ma.end);
    if(next<=i.front){s.phase='AT_BOUNDARY';event(s,action,'Authority boundary reached; this lesson cannot move farther','warn','OBU');return;}
    i.front=next;
    s.phase=next===s.ma.end?'AT_BOUNDARY':'TRAIN_RUNNING';
    event(s,action,`Train front advanced to ${next} m; remaining authority ${Math.max(0,s.ma.end-next)} m`,'ok','OBU');
  }else if(action==='occupy'){
    i.sectionClear=false;
    s.phase=s.ma?'REVIEW':'WAITING';
    event(s,action,s.ma?'Section became occupied after issue; no instantaneous MA withdrawal assumed':'Section occupied; a new MA cannot be issued','danger','Detection');
  }else if(action==='restore'){
    i.sectionClear=true;i.emergencyReceived=false;
    s.ma=null;s.phase=maGuards(i).length?'WAITING':'READY';
    event(s,action,'Inputs restored. Prior MA cleared in teaching fixture; request a new authority','warn','SimWorld');
  }
}

function interlockingAction(s,action){
  const i=s.inputs;
  if(action==='request'){
    if(s.routeLocked){event(s,action,'R_AB remains locked; release or clear the train before requesting again','warn','IXL');return;}
    const missing=routeGuards(i);
    if(missing.length){s.phase='ROUTE_DENIED';event(s,action,'Route R_AB refused: '+missing.join('; '),'danger','IXL');}
    else{s.routeLocked=true;s.occupied=false;s.phase='ROUTE_LOCKED';event(s,action,'R_AB proved and locked; conflict R_CONFLICT excluded','ok','IXL');}
  }else if(action==='enter'){
    if(!s.routeLocked||s.phase==='REVIEW'){event(s,action,'Train cannot enter: route not proved or requires review','danger','IXL');return;}
    s.occupied=true;s.phase='TRAIN_OCCUPYING';event(s,action,'Train entered T1; R_AB lock retained','ok','Detection');
  }else if(action==='clear'){
    if(!s.occupied){event(s,action,'Release refused: no simulated train traversal','warn','IXL');return;}
    s.occupied=false;s.routeLocked=false;s.phase='RELEASED';
    event(s,action,'Train proved clear; synthetic route release performed','ok','IXL');
  }else if(action==='cancel'){
    if(!s.routeLocked){event(s,action,'No route lock to cancel','warn','IXL');return;}
    if(i.approachOccupied||s.occupied){s.phase='APPROACH_HELD';event(s,action,'Cancellation held: approach/route occupied; no timer override modelled','danger','IXL');}
    else{s.routeLocked=false;s.phase='RELEASED';event(s,action,'Route cancelled with approach and route clear','ok','IXL');}
  }
}

function radioAction(s,action){
  const i=s.inputs;
  if(action==='connect'){
    if(!i.radioAvailable||!i.versionCompatible){s.session=false;s.phase='REFUSED';event(s,action,'Session refused: bearer unavailable or system version incompatible','danger','RBC');}
    else{s.session=true;s.phase='CONNECTED';event(s,action,'Teaching session established (not real Euroradio handshake)','ok','RBC');}
  }else if(action==='report'){
    if(!s.session||!i.positionKnown){s.phase='REPORT_BLOCKED';event(s,action,'Position report blocked: session or position reference missing','danger','OBU');return;}
    s.report={trainId:i.trainId,front:i.front};s.phase='REPORT_RECEIVED';
    event(s,action,`Position report received: ${i.trainId} at ${i.front} m`,'ok','RBC');
  }else if(action==='drop'){
    i.radioAvailable=false;s.session=false;s.phase='RADIO_LOST';
    event(s,action,'Radio lost. Last report remains historical; no assumption about MA revocation','danger','Radio');
  }else if(action==='restore'){
    i.radioAvailable=true;s.session=false;s.phase='DISCONNECTED';event(s,action,'Bearer restored: new session still required','warn','Radio');
  }
}

export function stepLesson(previous,command){
  if(!command||typeof command!=='object')throw new Error('Lesson command required');
  if(command.type==='reset')return createLessonState(previous.lessonId);
  const lesson=lessonById(previous.lessonId);
  if(lesson.authoredRule)return stepAuthoredLesson(previous,command,lesson);
  if(lesson.family)return stepCourseLesson(previous,command,lesson);
  const s={...previous,inputs:{...previous.inputs},events:[...previous.events]};
  if(command.type==='set'){
    onSet(s,command.values);
    if(!s.feedback||s.feedback.sequence===previous.sequence)event(s,'set','Inputs updated — use the next action to evaluate the effect','ink','Operator');
    return s;
  }
  if(!lesson.actions.some(a=>a.id===command.type))throw new Error('Unsupported lesson action: '+command.type);
  if(s.lessonId==='ma')maAction(s,command.type);
  else if(s.lessonId==='interlocking')interlockingAction(s,command.type);
  else radioAction(s,command.type);
  return s;
}

const yes=v=>v?'Yes':'No';
const stat=(label,value)=>({label,value:String(value)});

/** One projection, reused by desktop cards, graph highlights, status and handheld. */
export function lessonSnapshot(s){
  const lesson=lessonById(s.lessonId);
  if(lesson.authoredRule)return authoredSnapshot(s,lesson);
  if(lesson.family)return courseSnapshot(s,lesson);
  const i=s.inputs;
  if(s.lessonId==='ma'){
    const ma=s.ma;
    const end=ma?.end;
    const remaining=ma?Math.max(0,end-i.front):null;
    const valid=Boolean(ma)&&!['STOP_REQUIRED','REVIEW','WITHHELD'].includes(s.phase);
    const reason=s.events.at(-1)?.message??'Ready to evaluate route and train data';
    const stats=[stat('Tutorial state',s.phase.replaceAll('_',' ')),stat('Authority remaining',remaining===null?'—':`${remaining} m`),
      stat(ma?ma.kind:'Proposed end',`${end??i.end} m`),stat('Permitted speed',`${ma?.permitted??i.permitted} km/h`),
      stat('Target at MA end',`${ma?.target??i.target} km/h`)];
    const facts=[stat('Authority issued',yes(Boolean(ma))),stat('Authority usable in lesson',yes(valid)),
      stat('Current front',`${i.front} m`),stat('Route proved',yes(i.routeProved)),stat('Protected section clear',yes(i.sectionClear)),
      stat('Safe radio session',yes(i.radioSafe)),stat('Position accepted',yes(i.positionKnown))];
    return {phase:s.phase,valid,reason,stats,facts,status:valid?'Authority available':s.phase==='REVIEW'?'Review required':'No usable authority',
      statusTone:valid?'ok':s.phase==='REVIEW'||s.phase==='STOP_REQUIRED'?'danger':'warn',
      readerHeader:'MOVEMENT AUTHORITY',readerRows:[stat('Authority remaining',remaining===null?'—':`${remaining} m`),
        stat(ma?ma.kind:'Proposed end',`${end??i.end} m`),stat('Target at end',`${ma?.target??i.target} km/h`),
        stat('Permitted speed',`${ma?.permitted??i.permitted} km/h`),stat('Train front',`${i.front} m`),
        stat('Route proved',yes(i.routeProved)),stat('Radio',yes(i.radioSafe)),stat('Section clear',yes(i.sectionClear))],
      speedline:{start:0,end:end??i.end,position:i.front,speed:ma?.permitted??i.permitted},
      source:lessonById(s.lessonId).source};
  }
  if(s.lessonId==='interlocking'){
    const valid=s.routeLocked&&['ROUTE_LOCKED','TRAIN_OCCUPYING'].includes(s.phase);
    const facts=[stat('Point P1 detected',yes(i.pointProved)),stat('Track T1 clear',yes(i.trackClear&&!s.occupied)),
      stat('Overlap clear',yes(i.overlapClear)),stat('Flank protection',yes(i.flankLocked)),
      stat('Conflicting route free',yes(i.conflictFree)),stat('Approach occupied',yes(i.approachOccupied))];
    return {phase:s.phase,valid,reason:s.events.at(-1)?.message??'Awaiting route request',
      stats:[stat('State',s.phase.replaceAll('_',' ')),stat('Route',s.routeLocked?'LOCKED':'NOT SET'),
        stat('Point P1',i.pointProved?'DETECTED':'FAILED'),stat('Track T1',s.occupied?'OCCUPIED':i.trackClear?'CLEAR':'BLOCKED'),
        stat('Conflict',i.conflictFree?'NONE':'PRESENT')],facts,status:valid?'Route locked':s.phase==='ROUTE_DENIED'||s.phase==='REVIEW'?'Route not available':'Awaiting route',
      statusTone:valid?'ok':s.phase==='ROUTE_DENIED'||s.phase==='REVIEW'?'danger':'warn',readerHeader:'ROUTE R_AB',
      readerRows:[stat('Route lock',yes(s.routeLocked)),...facts],speedline:null,source:lessonById(s.lessonId).source};
  }
  const valid=s.session;
  const facts=[stat('Version compatible',yes(i.versionCompatible)),stat('Bearer available',yes(i.radioAvailable)),
    stat('Position known',yes(i.positionKnown)),stat('Last report',s.report?`${s.report.trainId} @ ${s.report.front} m`:'None')];
  return {phase:s.phase,valid,reason:s.events.at(-1)?.message??'Not connected',
    stats:[stat('State',s.phase.replaceAll('_',' ')),stat('Session',s.session?'ESTABLISHED':'NONE'),
      stat('Train',i.trainId),stat('Train front',`${i.front} m`),stat('Report',s.report?'RECEIVED':'NOT SENT')],facts,
    status:valid?'Session established':s.phase==='RADIO_LOST'?'Radio lost':'No active session',
    statusTone:valid?'ok':s.phase==='RADIO_LOST'||s.phase==='REFUSED'?'danger':'warn',
    readerHeader:'RBC / RADIO',readerRows:[stat('Train',i.trainId),stat('Session',yes(s.session)),
      stat('Train front',`${i.front} m`),...facts],speedline:null,source:lessonById(s.lessonId).source};
}

export function replayLesson(id,scenarioId){
  const lesson=lessonById(id);const scenario=lesson.scenarios.find(x=>x.id===scenarioId);
  if(!scenario)throw new Error('Unknown scenario: '+scenarioId);
  let state=createLessonState(lesson.id);
  for(const item of scenario.steps)state=stepLesson(state,item.burst?{type:'burst',events:item.burst}:item.set?{type:'set',values:item.set}:{type:item.action});
  return state;
}
