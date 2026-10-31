/* Pure deterministic, source-labelled teaching models for 12 individually authored
 * functions. No TrainSim DB access, network, production signalling or safety use.
 * A result is a functional explanation, NOT an implementation of SUBSET-026. */
const round=(n,d=2)=>Number(Number(n).toFixed(d));
const metric=(label,value)=>({label,value:String(value)});
const v=(i,k)=>i[k];
const err=(...items)=>items.filter(Boolean);
const ok=(reasons,values,reason)=>({ok:reasons.length===0,reasons,values,reason:reasons[0]??reason});
const yes=x=>x?'Yes':'No';

/** Per-function unique guards and computed signals. The reference snippets in
 * authored-lessons.js identify exact normative versus synthetic boundaries. */
export function evaluateAuthored(key,i,rt={}){
  switch(key){
  case 'balise-link': {
    const offset=round(i.detectedAt-i.expectedAt),inWindow=Math.abs(offset)<=i.window;
    const identity=i.expectedBg===i.detectedBg,direction=i.expectedDirection===i.observedDirection;
    const reasons=err(!i.linkingAvailable&&'No stored linking information',!identity&&'Balise group identity differs',!inWindow&&'Detected outside configured teaching window',!direction&&'Passing direction differs');
    return ok(reasons,{expected:i.expectedBg,observed:i.detectedBg,offset:`${offset} m`,withinWindow:yes(inWindow),direction:yes(direction),configuredReaction:reasons.length?i.reaction:'None'},'Linked group and direction are consistent in this model');
  }
  case 'confidence': {
    const over=i.locAcc+i.over+(i.gamma?i.trainOver:0),under=i.locAcc+i.under+(i.gamma?i.trainUnder:0);
    const min=round(i.front-over),max=round(i.front+under);
    const reasons=err(!i.lrbgKnown&&'LRBG reference unknown');
    return ok(reasons,{minSafeFront:`${min} m`,maxSafeFront:`${max} m`,overAllowance:`${round(over)} m`,underAllowance:`${round(under)} m`,intervalWidth:`${round(max-min)} m`,gamma:i.gamma?'1':'0'},'LRBG confidence interval derived (fixed orientation teaching case)');
  }
  case 'position-report': {
    const hasLRBG=Boolean(i.lrbg&&i.lrbg.trim());
    const reasons=err(!i.radio&&'No safe communications session',!hasLRBG&&'LRBG identity missing',!['nominal','reverse'].includes(i.orientation)&&'Invalid LRBG orientation',!['nominal','reverse'].includes(i.runningDirection)&&'Invalid movement direction');
    const report={lrbg:i.lrbg,estimatedDistance:i.distance,over:i.over,under:i.under,orientation:i.orientation,runningDirection:i.runningDirection,speed:i.speed,standstill:i.speed===0,integrity:i.integrity};
    return ok(reasons,{LRBG:i.lrbg||'(missing)',distance:`${i.distance} m`,confidence:`−${i.over}/+${i.under} m`,movement:i.speed===0?'Standstill':`${i.speed} km/h`,integrity:yes(i.integrity),reportFields:String(Object.keys(report).length),report},'Report fields prepared for synthetic RBC receiver');
  }
  case 'radio-session': {
    const reasons=err(!i.bearer&&'Radio bearer unavailable',!i.registered&&'Radio not registered',!i.rbcReachable&&'RBC unreachable',!i.versionCompatible&&'Incompatible system version',!i.authAccepted&&'Safe connection not accepted');
    return ok(reasons,{rbc:i.rbcId,network:yes(i.registered),safetyAccepted:yes(i.authAccepted),sessionState:rt.session?'Established':'Not established',recontacts:String(rt.contacts??0)},'Network/connection preconditions met; establish session as a separate event');
  }
  case 'start-mission': {
    const reasons=err(!i.standBy&&'SoM engages in Stand By',!i.deskOpen&&'Driving desk closed',i.oldSession&&'Existing session must first terminate',i.driverStatus!=='valid'&&'Driver ID must be entered or revalidated',!i.driverId.trim()&&'Driver identity missing',i.levelStatus!=='valid'&&'Level data not valid',i.positionStatus!=='valid'&&'Position data needs handling',!i.trainDataValid&&'Train data needs validation',i.level==='2'&&!i.radioRegistered&&'Radio registration for Level 2 missing');
    return ok(reasons,{driver:i.driverId||'(missing)',storedDriverStatus:i.driverStatus,positionStatus:i.positionStatus,level:i.level,decision:reasons.length?'Data entry / revalidation required':'SoM decision prerequisites present',stepsProcessed:String(rt.progress??0)},'Selected S0–D7 teaching decision points cleared');
  }
  case 'ixl-boundary': {
    const reasons=err(!i.request&&'No dispatcher request',!i.pointDetected&&'Point not proved',!i.routeClear&&'Route section occupied',!i.overlap&&'Overlap unavailable',!i.flank&&'Flank protection absent',!i.conflictFree&&'Conflicting route established');
    return ok(reasons,{request:yes(i.request),point:yes(i.pointDetected),track:yes(i.routeClear),conflicts:i.conflictFree?'0':'1+',routeLock:rt.routeLocked?'Locked':'Not locked',approach:yes(i.approachOccupied)},'Synthetic IXL route may be locked independently of the TMS');
  }
  case 'movement-authority': {
    const shortening=i.proposedEnd<i.currentEnd;
    const reasons=err(!i.routeProved&&'Interlocking route not proved',!i.positionAccepted&&'Position report not accepted',!i.radio&&'No safe radio session',i.proposedEnd<=i.front&&'End not ahead of train',shortening&&!i.shorteningAck&&'Co-operative shortening not acknowledged in fixture');
    const kind=i.targetSpeed===0?'EOA':'LOA';
    return ok(reasons,{type:kind,newEnd:`${i.proposedEnd} m`,remaining:`${Math.max(0,i.proposedEnd-i.front)} m`,targetAtEnd:`${i.targetSpeed} km/h`,change:i.proposedEnd>i.currentEnd?'Extension proposal':shortening?'Shortening proposal':'Repetition',accepted:yes(!reasons.length)},'RBC can propose new authority; real MA message/timeout rules not represented');
  }
  case 'speed-gradient': {
    const ceiling=Math.min(i.staticSpeed,i.temporarySpeed,i.trainSpeed,i.modeSpeed);
    const binding=[['SSP',i.staticSpeed],['TSR',i.temporarySpeed],['Train',i.trainSpeed],['Mode',i.modeSpeed]].filter(([,x])=>x===ceiling).map(([name])=>name).join(' + ');
    const reasons=err(!i.profileValid&&'Trackside profile not accepted',!i.trainData&&'Train performance data missing');
    return ok(reasons,{sampleCeiling:`${ceiling} km/h`,restrictingSource:binding,gradient:`${i.gradient} ‰`,lineLimit:`${i.staticSpeed} km/h`,temporaryLimit:`${i.temporarySpeed} km/h`,trainLimit:`${i.trainSpeed} km/h`},'Point-sampled most restrictive speed, gradient tracked separately');
  }
  case 'brake-target': {
    const speed=i.speed/3.6,target=i.targetSpeed/3.6;
    // Pedagogical simplification ONLY. NOT an EBD/SBD or ETCS intervention curve.
    const needed= Math.max(0,(speed**2-target**2)/(2*i.decel))+speed*i.buildUp;
    const margin=i.distance-needed;
    const reasons=err(!i.brakeDataValid&&'Train brake model unavailable',!i.targetKnown&&'No supervised target');
    return ok(reasons,{toyDistance:`${round(needed)} m`,distance:`${i.distance} m`,toyMargin:`${round(margin)} m`,toyStatus:margin>=0?'Positive illustrative margin':'Negative illustrative margin',targetSpeed:`${i.targetSpeed} km/h`,deceleration:`${i.decel} m/s²`},'Illustrative distance budget only; actual ETCS braking targets require piecewise curves');
  }
  case 'mode-transition': {
    const known=['FS','SR','TR'],candidate=known.includes(i.requestedMode),canFS=i.authority&&i.trainData&&i.positionKnown;
    const reasons=err(!candidate&&'Unknown candidate mode',i.tripCommand&&i.requestedMode!=='TR'&&'Trip condition takes precedence',i.requestedMode==='FS'&&!canFS&&'Illustrative FS prerequisites incomplete');
    return ok(reasons,{from:i.currentMode,to:i.requestedMode,tripInput:yes(i.tripCommand),authority:yes(i.authority),candidate:reasons.length?'Review against full Chapter 4 tables':'Prerequisite demonstration only',actualMode:rt.mode??i.currentMode},'Candidate is NOT an approved Chapter 4 mode transition');
  }
  case 'emergency': {
    const isUnconditional=i.type==='unconditional',isConditional=i.type==='conditional';
    const passed=i.stopAt<i.minSafeFront;
    const wrongRevocation=i.revocation&&i.revokeId!==i.messageId;
    const reasons=err(!isConditional&&!isUnconditional&&'Unknown emergency message type',isConditional&&passed&&'Conditional stop location already passed by min safe front',isConditional&&i.stopAt>i.oldEOA&&'Outside simplified EOA case; consult SvL/LOA rules',wrongRevocation&&'Revocation does not reference accepted emergency ID');
    const accepted=reasons.length===0&&!i.revocation;
    return ok(reasons,{messageType:i.type,stopId:String(i.messageId),stopLocation:isUnconditional?'Immediate trip':`${i.stopAt} m`,accepted:yes(accepted),newEOA:isConditional&&accepted?`${Math.min(i.stopAt,i.oldEOA)} m`:'—',maBlocked:yes(accepted&&i.maProposed),revocation:i.revocation?(wrongRevocation?'ID mismatch':'Matching message ID'):'Not received'},i.revocation?'Revocation matched: other emergency messages unaffected':isUnconditional?'Unconditional stop: trip immediately':'Conditional stop accepted in simplified EOA case');
  }
  case 'rbc-handover': {
    const distinct=i.oldRbc!==i.newRbc;
    const reasons=err(!distinct&&'Supervising and accepting RBC identical',!i.routeToBorder&&'No route to accepting RBC area',!i.trainInfo&&'Required train identity / version / data missing',!i.acceptingReady&&'Accepting RBC unprepared',!i.routeInfo&&'Route information unavailable');
    return ok(reasons,{from:i.oldRbc,to:i.newRbc,accepting:yes(i.acceptingReady),routeData:yes(i.routeInfo),simultaneousSession:i.onboardSession?'Possible':'Unavailable / potential delay',supervising:rt.currentRbc??i.oldRbc},'Handover information prerequisites available; actual FIS not implemented');
  }
  default: throw new Error('Unknown authored function '+key);
  }
}

const maxEvents=80;
const add=(s,action,message,tone='ink',actor='SimWorld',tick)=>{
  s.sequence++;s.events=[...s.events,{n:s.sequence,action,message,tone,actor,tick}].slice(-maxEvents);
  s.feedback={message,tone,sequence:s.sequence};
  if(!s.seenPhases.includes(s.phase))s.seenPhases.push(s.phase);
};
export function initialAuthoredState(lesson){
  return {lessonId:lesson.id,phase:'IDLE',inputs:Object.fromEntries(lesson.inputs.map(x=>[x.id,x.default])),
    runtime:{progress:0,contacts:0,session:false,routeLocked:false,reportCount:0,currentRbc:null},
    outcome:null,events:[],seenPhases:['IDLE'],sequence:0,feedback:null,tick:0};
}
function setInput(s,lesson,values,actor='Operator',tick){
  for(const [id,raw] of Object.entries(values??{})){
    const field=lesson.inputs.find(x=>x.id===id);if(!field)throw new Error('Unknown authored input '+id);
    let value;
    if(field.kind==='boolean')value=raw===true;
    else if(field.kind==='text'){
      value=String(raw??'').trim();if(value.length>40)throw new Error(`${field.label} exceeds 40 characters`);
    }else{
      value=Number(raw);if(raw===''||!Number.isFinite(value)||value<field.min||value>field.max)throw new Error(`${field.label} must be between ${field.min} and ${field.max}`);
    }
    s.inputs[id]=value;
  }
  if(['ACTIVE','PROGRESS','COMPLETE'].includes(s.phase))s.phase='REVIEW';
  add(s,'set',`Signal update: ${Object.keys(values??{}).join(', ')||'none'}; re-evaluation required`, 'warn',actor,tick);
}
function progressEffect(s,lesson){
  const i=s.inputs,r=s.runtime;
  switch(lesson.authoredRule){
  case 'balise-link':r.lastPassed=i.detectedBg;break;
  case 'confidence':i.front+=10;i.over=round(i.over+1);i.under=round(i.under+1);break;
  case 'position-report':r.reportCount=(r.reportCount??0)+1;r.lastReport={lrbg:i.lrbg,distance:i.distance,speed:i.speed};i.distance+=25;break;
  case 'radio-session':r.contacts++;r.session=true;break;
  case 'start-mission':r.lastSomDecision=r.progress===0?'Driver data checked':'Level/position decision checked';break;
  case 'ixl-boundary':r.routeLocked=r.progress===0;break;
  case 'movement-authority':r.lastAuthorityEnd=i.proposedEnd;i.front=Math.min(i.proposedEnd,i.front+300);break;
  case 'speed-gradient':r.sampledAt=(r.sampledAt??0)+200;break;
  case 'brake-target':i.distance=Math.max(0,i.distance-100);i.speed=Math.max(i.targetSpeed,i.speed-5);break;
  case 'mode-transition':r.modeCandidate=i.requestedMode;break;
  case 'emergency':r.emergencyHeld=!i.revocation;r.acceptedId=i.messageId;break;
  case 'rbc-handover':r.currentRbc=r.progress===0?i.oldRbc:i.newRbc;break;
  }
  r.progress++;
}
export function stepAuthoredLesson(previous,cmd,lesson){
  const s={...previous,inputs:{...previous.inputs},runtime:{...previous.runtime},events:[...previous.events],seenPhases:[...previous.seenPhases]};
  if(cmd.type==='reset')return initialAuthoredState(lesson);
  if(cmd.type==='set'){setInput(s,lesson,cmd.values);return s;}
  if(cmd.type==='burst'){
    s.tick++;
    for(const e of cmd.events??[])setInput(s,lesson,e.set,e.actor??'Independent actor',`B${s.tick}`);
    add(s,'burst','Same-tick multi-source event batch applied; no automatic acceptance','warn','SimWorld',`B${s.tick}`);
    return s;
  }
  if(cmd.type==='disrupt'){
    setInput(s,lesson,lesson.faultVectors[0],'Injected failure');return s;
  }
  if(cmd.type==='restore'){
    s.inputs=Object.fromEntries(lesson.inputs.map(f=>[f.id,f.default]));
    s.runtime={...initialAuthoredState(lesson).runtime};s.phase='RECOVERED';s.outcome=null;
    add(s,'restore','Fixture restored; function must be evaluated again','warn');return s;
  }
  if(cmd.type==='evaluate'){
    const result=evaluateAuthored(lesson.authoredRule,s.inputs,s.runtime);
    s.outcome=result;s.phase=result.ok?'ACTIVE':'BLOCKED';
    if(result.ok)s.runtime.progress=0;
    add(s,'evaluate',`${result.ok?'Accepted':'Withheld'}: ${result.reason}`,result.ok?'ok':'danger',lesson.diagrams.actors.at(-2)?.text??'Model');return s;
  }
  if(cmd.type==='progress'){
    if(!['ACTIVE','PROGRESS'].includes(s.phase)){
      add(s,'progress','Progress refused: re-evaluate function conditions before proceeding','danger');return s;
    }
    const current=evaluateAuthored(lesson.authoredRule,s.inputs,s.runtime);
    if(!current.ok){s.phase='REVIEW';add(s,'progress','Inputs no longer satisfy this function: '+current.reasons.join('; '),'danger');return s;}
    progressEffect(s,lesson);
    s.outcome=evaluateAuthored(lesson.authoredRule,s.inputs,s.runtime);
    s.phase=s.runtime.progress>=2?'COMPLETE':'PROGRESS';
    add(s,'progress',`${lesson.title}: educational processing event ${s.runtime.progress} of 2 recorded`,'ok',lesson.diagrams.actors.at(-1)?.text??'Model');return s;
  }
  throw new Error('Unsupported authored action '+cmd.type);
}
export function authoredSnapshot(s,lesson){
  const evaluated=evaluateAuthored(lesson.authoredRule,s.inputs,s.runtime);
  const active=['ACTIVE','PROGRESS','COMPLETE'].includes(s.phase)&&evaluated.ok;
  const scalar=Object.entries(evaluated.values).filter(([,value])=>typeof value!=='object').map(([label,value])=>metric(label,value));
  const stats=[metric('Function state',s.phase.replaceAll('_',' ')),...scalar.slice(0,5)];
  const facts=[metric('Evaluated conditions',yes(Boolean(s.outcome))),metric('Current input checks',yes(evaluated.ok)),metric('Process events',s.runtime.progress),...scalar];
  const atBoundary=lesson.authoredRule==='movement-authority'&&s.phase==='COMPLETE'&&s.inputs.front===s.inputs.proposedEnd;
  const status=atBoundary?'Authority boundary reached (teaching)':active?'Function accepted (teaching)':s.phase==='REVIEW'?'Changed: review required':s.phase==='BLOCKED'?'Function withheld':'Awaiting evaluation';
  const speedline=lesson.authoredRule==='movement-authority'?{start:0,end:s.inputs.proposedEnd,position:s.inputs.front,speed:s.inputs.targetSpeed}:
    lesson.authoredRule==='brake-target'?{start:0,end:Math.max(1,s.inputs.distance),position:0,speed:s.inputs.speed}:null;
  return {phase:s.phase,valid:active,reason:s.events.at(-1)?.message??evaluated.reason,stats,facts,status,
    statusTone:active?'ok':s.phase==='BLOCKED'||s.phase==='REVIEW'?'danger':'warn',
    readerHeader:lesson.title.toUpperCase().slice(0,24),readerRows:[...stats,...facts.slice(0,2)],
    speedline,source:lesson.source};
}