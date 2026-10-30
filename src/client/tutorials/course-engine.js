/**
 * Generic self-contained educational test engine, *not* ETCS equipment logic.
 * Shared causal state recorder; family-specific calculations use illustrative
 * physics/guards labelled clearly as synthetic training calculations.
 */
import {FAMILY_SPEC} from './course-source.js';

const maxLog=96;
const stat=(label,value)=>({label,value:String(value)});
const yn=v=>v?'Yes':'No';
const copy=s=>({...s,inputs:{...s.inputs},events:[...s.events],metrics:{...s.metrics}});
const emit=(s,action,message,tone='ink',actor='SimWorld',tick=null)=>{
  s.sequence++;
  s.events.push({n:s.sequence,action,message,tone,actor,tick:tick??s.sequence});
  if(s.events.length>maxLog)s.events=s.events.slice(-maxLog);
  s.feedback={message,tone,sequence:s.sequence};
};
export function initialCourseState(lesson){
  return {lessonId:lesson.id,inputs:Object.fromEntries(lesson.inputs.map(f=>[f.id,f.default])),
    phase:'IDLE',events:[],sequence:0,feedback:null,progress:0,metrics:{},evaluation:null,
    wave:0,seenPhases:['IDLE']};
}
function advancePhase(s,phase){s.phase=phase;if(!s.seenPhases.includes(phase))s.seenPhases.push(phase);}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function setValue(field,raw){
  if(field.kind==='boolean'){
    if(typeof raw!=='boolean')throw new Error(`${field.label}: expected boolean`);
    return raw;
  }
  if(field.kind==='text'){
    const value=String(raw??'').trim();if(!value||value.length>30)throw new Error(`${field.label}: enter 1–30 characters`);
    return value;
  }
  if(raw===''||raw===null||typeof raw==='boolean')throw new Error(`${field.label}: numeric value required`);
  const value=Number(raw);
  if(!finite(value)||value<field.min||value>field.max)throw new Error(`${field.label} must be ${field.min}–${field.max}`);
  return value;
}
function setInputs(s,lesson,values,actor='Learner',tick=null){
  const entries=Object.entries(values??{});
  if(!entries.length)throw new Error('At least one input required');
  const updates={};
  for(const [id,raw] of entries){
    const field=lesson.inputs.find(i=>i.id===id);
    if(!field)throw new Error('Unknown ESIG lesson input: '+id);
    updates[id]=setValue(field,raw);
  }
  Object.assign(s.inputs,updates);
  if(['ACTIVE','PROGRESS','COMPLETE'].includes(s.phase))advancePhase(s,'REVIEW');
  s.evaluation=null;
  emit(s,'set',`${actor} supplied ${entries.length} input vector(s): ${entries.map(([k])=>k).join(', ')}. Review before progressing.`,
    'warn',actor,tick);
}
function inspectFamily(lesson,i){
  const family=lesson.family;
  const spec=FAMILY_SPEC[family];
  if(!spec)throw new Error('Unknown course family: '+family);
  const issues=[];const metrics={};
  // These are lesson-only gates; *not* normative ETCS acceptance equations.
  for(const [id,label,kind] of spec.inputs){if(kind==='boolean'&&!i[id])issues.push(label+' = No');}
  if(family==='position'){
    const lo=Math.max(0,i.measuredPosition-i.positionError),hi=i.measuredPosition+i.positionError;
    metrics['Confidence example'] = `${lo.toFixed(1)}–${hi.toFixed(1)} m`;
    metrics['Illustrative width'] = `${(hi-lo).toFixed(1)} m`;
  }else if(family==='authority'){
    const remaining=i.maLimit-i.trainFront;
    if(remaining<=0)issues.push('Proposed authority limit not ahead of train');
    metrics['Authority remaining'] = `${Math.max(0,remaining)} m`;
    metrics['End designation'] = i.targetAtEnd===0?'EOA':'LOA';
    metrics['Target at end'] = `${i.targetAtEnd} km/h`;
  }else if(family==='braking'){
    // Generic v²/(2a)+v*t illustration only; actual ERTMS curves involve more
    // parameters, confidence intervals, reaction/build-up and ETCS-specific models.
    const mps=i.speed/3.6, target=i.targetSpeed/3.6;
    const distance=Math.max(0,(mps*mps-target*target)/(2*i.deceleration)+mps*i.buildUp);
    metrics['Toy stopping distance'] = `${distance.toFixed(1)} m`;
    metrics['Available distance'] = `${i.distance} m`;
    if(i.speed>i.permitted)issues.push('Current speed exceeds selected permitted speed');
    if(distance>i.distance)issues.push('Toy stopping-distance budget exceeded');
  }else if(family==='profile'){
    const limit=i.restrictionActive?Math.min(i.lineSpeed,i.temporarySpeed):i.lineSpeed;
    metrics['Toy restrictive limit'] = `${limit} km/h`;
    metrics['Gradient input'] = `${i.gradient} ‰`;
    if(limit<0)issues.push('Invalid speed restriction');
  }else if(family==='version'){
    metrics['Compared versions']=`${i.operatedVersion} / ${i.supportedVersion}`;
    if(i.operatedVersion!==i.supportedVersion)issues.push('Toy exact-match version policy rejected pair');
  }else if(family==='radio'){
    metrics['Sample position report'] = `${i.trainFront} m`;
  }else if(family==='handover'){
    metrics['Illustrative handover front'] = `${i.front} m`;
  }else if(family==='packet'){
    metrics['Packet ID'] = `NID_PACKET ${i.packetId??'family'}`;
    metrics['Declared sample bits'] = `${i.packetBits}`;
  }else if(family==='message'){
    metrics['Message ID'] = i.messageId??'Family';
  }else if(family==='architecture'||family==='level'){
    metrics['Application level'] = i.level??i.tracksideLevel??'n/a';
  }
  return {ok:issues.length===0,issues,metrics};
}
export function stepCourseLesson(previous,command,lesson){
  if(!command||typeof command!=='object')throw new Error('Course command is required');
  if(command.type==='reset')return initialCourseState(lesson);
  const s=copy(previous);const kind=command.type;
  if(kind==='set'){
    setInputs(s,lesson,command.values);return s;
  }
  if(kind==='burst'){
    const events=command.events??[];
    if(!Array.isArray(events)||events.length<2||events.length>8)throw new Error('Busy burst requires 2–8 vectors');
    s.wave++;
    const tick=`B${s.wave}`;
    for(const stimulus of events)setInputs(s,lesson,stimulus.set,stimulus.actor??'Source',tick);
    emit(s,'burst',`Busy burst ${tick}: ${events.length} competing signals received within the same teaching tick`,'danger','SimWorld',tick);
    return s;
  }
  if(kind==='evaluate'){
    const evaluation=inspectFamily(lesson,s.inputs);
    s.evaluation=evaluation;s.metrics=evaluation.metrics;
    if(evaluation.ok){advancePhase(s,'ACTIVE');s.progress=0;
      emit(s,kind,`Illustrative ${lesson.familyDescriptor} conditions accepted; output available for inspection`, 'ok',lesson.familyDescriptor);
    }else{advancePhase(s,'BLOCKED');
      emit(s,kind,`Illustrative output withheld: ${evaluation.issues.join('; ')}`,'danger',lesson.familyDescriptor);
    }
    return s;
  }
  if(kind==='progress'){
    if(!['ACTIVE','PROGRESS'].includes(s.phase)){
      emit(s,kind,'Event blocked: re-evaluate required before progression','danger','SimWorld');return s;
    }
    s.progress++;
    advancePhase(s,s.progress>=2?'COMPLETE':'PROGRESS');
    emit(s,kind,s.phase==='COMPLETE'?'Illustrative two-step function sequence completed':`Process event ${s.progress} accepted`, 'ok',lesson.familyDescriptor);
    return s;
  }
  if(kind==='disrupt'){
    const spec=FAMILY_SPEC[lesson.family],fault=lesson.inputs.find(f=>f.id===spec.fault);
    const change=fault.kind==='boolean'?false:fault.id==='permitted'?35:0;
    setInputs(s,lesson,{[spec.fault]:change},'Failure injector');
    emit(s,'disrupt',`Injected synthetic failure: ${fault.label}`,'danger','Failure injector');
    return s;
  }
  if(kind==='restore'){
    s.inputs=Object.fromEntries(lesson.inputs.map(f=>[f.id,f.default]));
    s.progress=0;s.evaluation=null;s.metrics={};advancePhase(s,'RECOVERED');
    emit(s,kind,'Synthetic input vectors restored; re-evaluation is still required','warn','SimWorld');
    return s;
  }
  throw new Error('Unsupported course action: '+kind);
}
export function courseSnapshot(state,lesson){
  const i=state.inputs,ev=state.evaluation;
  const available=Boolean(ev?.ok)&&['ACTIVE','PROGRESS','COMPLETE'].includes(state.phase);
  const stats=[stat('Lesson state',state.phase.replaceAll('_',' ')),
    stat('Result',available?'INPUTS ACCEPTED':state.phase==='BLOCKED'?'WITHHELD':'RECHECK NEEDED'),
    stat('Events processed',state.progress),
    stat('Source clause',`§${lesson.clause}`),
    stat('Figures indexed',lesson.sourceFigures?.length??0)];
  const inputs=lesson.inputs.slice(0,10).map(f=>stat(f.label,f.kind==='boolean'?yn(i[f.id]):`${i[f.id]}${f.unit?' '+f.unit:''}`));
  const calculated=Object.entries(state.metrics??{}).map(([k,v])=>stat(k,v));
  const facts=[...calculated,...inputs];
  const recent=state.events.at(-1)?.message??'Ready to evaluate the example data';
  let line=null;
  if(lesson.family==='authority')line={start:0,end:i.maLimit,position:i.trainFront,speed:0};
  if(lesson.family==='position')line={start:0,end:Math.max(1000,i.measuredPosition+200),position:i.measuredPosition,speed:0};
  return {phase:state.phase,valid:available,reason:recent,stats,facts,status:available?'Example active':state.phase==='BLOCKED'?'Example blocked':state.phase==='REVIEW'?'Input changed — review':'Evaluate the inputs',
    statusTone:available?'ok':state.phase==='REVIEW'||state.phase==='BLOCKED'?'danger':'warn',
    readerHeader:lesson.familyDescriptor.toUpperCase(),readerRows:[...stats,...calculated,...inputs],
    speedline:line,source:lesson.source};
}
