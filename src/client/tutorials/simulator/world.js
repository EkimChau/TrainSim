/**
 * Reusable, deterministic training-world projection for the first simulator.
 *
 * Tracks/sprites are teaching geometry and never surveyed infrastructure.
 * IXL guards are evaluated by the EXISTING Lesson 009 authored engine.
 * All other simulated effects (movement, radio, BG, MA, level) are explicitly
 * synthetic scenario events, NOT normative SUBSET-026 signalling behaviour.
 *
 * In particular a radio mast is a bearer, not a source of train coordinates:
 * train position is estimated by the OBU and sent to the RBC as a report.
 */
import {createLessonState,stepLesson,lessonSnapshot} from '../engine.js';

export const FIRST_SIM_LESSON='authored-ixl-boundary';
export const VECTOR_STYLE={
  version:1,rail:'#455366',ink:'#263648',paper:'#fff9eb',
  valid:'#318665',warning:'#d79a31',stop:'#c14d4a',
  radio:'#2878bb',inactive:'#97a4af',
  status:'valid = green; blocked = red; pending = amber; data = blue'
};
export const TRACK_WORLD=Object.freeze({
  id:'yard-junction',name:'Synthetic Junction / RBC interface',units:'m',
  viewBox:[0,0,1100,400],extent:[0,1000],trainLength:78,antennaOffset:32,
  tracks:[
    {id:'main',label:'Approach / main',y:210},
    {id:'upper',label:'Neighbouring line',y:118},
    {id:'diverge',label:'Turnout route',from:410,to:520,y:300}
  ],
  point:{id:'P1',metres:410,route:'diverge'},
  sections:[
    {id:'TC1',track:'main',from:0,to:440,label:'Approach section'},
    {id:'TC2',track:'diverge',from:500,to:850,label:'Selected route'},
    {id:'TC3',track:'upper',from:510,to:870,label:'Neighbouring line'}
  ],
  balises:[
    {id:'BG-1',metres:340,track:'main',label:'Location reference'},
    {id:'BG-2',metres:760,track:'diverge',label:'Illustrative level marker'}
  ],
  signals:[
    {id:'S1',metres:250,track:'main',label:'Entrance signal'},
    {id:'S2',metres:775,track:'upper',label:'Neighbour signal'}
  ],
  levelBoundary:{metres:770,from:'L0',to:'L2'},
  source:'Synthetic educational geometry — not a real signalling plan'
});
export const SIMULATOR_COMPONENTS=Object.freeze([
  {id:'train-A',kind:'train',label:'Train A / learner train',source:'SUBSET-026-3 §3.6'},
  {id:'train-B',kind:'train',label:'Train B / neighbouring train',source:'Synthetic traffic fixture'},
  {id:'P1',kind:'point',label:'Point P1',source:'External interlocking / site control table'},
  {id:'TC1',kind:'section',label:'TC1 approach',source:'External track detection'},
  {id:'TC2',kind:'section',label:'TC2 diverging route',source:'External track detection'},
  {id:'TC3',kind:'section',label:'TC3 neighbouring line',source:'External track detection'},
  {id:'BG-1',kind:'balise',label:'Balise BG-1',source:'SUBSET-026-3 §3.4'},
  {id:'BG-2',kind:'balise',label:'Balise BG-2 / marker',source:'SUBSET-026-3 §3.4; fictional placement'},
  {id:'S1',kind:'signal',label:'Signal S1',source:'External lineside signalling'},
  {id:'S2',kind:'signal',label:'Signal S2',source:'External lineside signalling'},
  {id:'IXL',kind:'interlocking',label:'Interlocking (IXL)',source:'SUBSET-026-2 §2.4.1.3(d), external'},
  {id:'RBC',kind:'rbc',label:'Radio Block Centre',source:'SUBSET-026-2 §2.5'},
  {id:'radio',kind:'radio',label:'Radio communication bearer',source:'SUBSET-026-3 §3.5'},
  {id:'boundary',kind:'boundary',label:'L0 / L2 transition',source:'SUBSET-026-5 §5.10, illustrative only'},
  {id:'DMI',kind:'dmi',label:'Driver display mockup',source:'SUBSET-026-4; non-normative UI'},
  {id:'BTM',kind:'btm',label:'Balise transmission antenna (train A)',source:'SUBSET-026-2 §2.5.2'},
  {id:'ODOM',kind:'odometry',label:'Onboard speed / odometry reading',source:'SUBSET-026-3 §3.6; synthetic reading'}
]);
const NORMAL_STEPS=[
  {id:'proof',kind:'route-request',label:'IXL checks route, flank and conflict evidence'},
  {id:'lock',kind:'point-lock',label:'Point P1 moves reverse and route locks'},
  {id:'approach',kind:'move',train:'A',to:308,speed:36,label:'Train A approaches first balise'},
  {id:'balise',kind:'move',train:'A',to:384,speed:32,label:'Antenna passes BG-1: position reference updated'},
  {id:'report',kind:'position-report',label:'OBU sends its estimated position to RBC via radio'},
  {id:'authority',kind:'ma-update',label:'Illustrative RBC authority event after proved route'},
  {id:'turnout',kind:'move',train:'A',to:652,speed:26,label:'Train A traverses the locked turnout onto diverging route'},
  {id:'report-turnout',kind:'position-report',label:'OBU refreshes RBC position after turnout at 652 m'},
  {id:'neighbour',kind:'move',train:'B',to:700,label:'Neighbouring train moves; TC3 remains occupied'},
  {id:'marker',kind:'move',train:'A',to:807,speed:18,label:'Train A passes BG-2 at the level boundary'},
  {id:'report-boundary',kind:'position-report',label:'OBU refreshes RBC position after BG-2 at 807 m'},
  {id:'level',kind:'level-transition',to:'L2',label:'Show L0 to L2 transition context (not normative logic)'},
  {id:'clear',kind:'move',train:'A',to:972,speed:0,label:'Train A clears TC2; release can be considered'},
  {id:'release',kind:'route-release',label:'IXL teaching route releases once selected route is clear'}
];
export const SIMULATOR_SCENARIOS=Object.freeze([
  {id:'normal',label:'Route proved → L2 entry',initial:{},
    description:'Two trains, BG detection, radio report, illustrative authority, turnout, occupancy and level context.',
    steps:NORMAL_STEPS},
  {id:'point-failure',label:'Point detection failure and recovery',initial:{},
    description:'Proof is refused with a failed point; an explicit restore and new evaluation are required.',
    steps:[
      {id:'fail',kind:'input',values:{pointDetected:false},label:'Point P1 detection lost'},
      {id:'refuse',kind:'route-request',label:'IXL refuses unproved route'},
      {id:'repair',kind:'restore-inputs',label:'Point detection restored — no automatic route'},
      ...NORMAL_STEPS.slice(0,6)
    ]},
  {id:'conflicting-train',label:'Conflicting train occupies route',initial:{otherTrack:'diverge',otherPosition:670},
    description:'A second train occupies the proposed route; refuse proof until the section clears.',
    steps:[
      {id:'refuse',kind:'route-request',label:'IXL refuses route while TC2 is occupied'},
      {id:'other-clear',kind:'move',train:'B',to:1000,label:'Train B clears TC2 (separate train movement)'},
      {id:'recheck',kind:'route-request',label:'IXL explicitly rechecks clear route'},
      ...NORMAL_STEPS.slice(1,6)
    ]},
  {id:'return-l0',label:'L2 → L0 illustration',initial:{level:'L2'},
    description:'Same vector world illustrates reverse level context, without inventing a regulatory transition procedure.',
    steps:NORMAL_STEPS.map(s=>s.kind==='level-transition'?
      {...s,to:'L0',label:'Show L2 to L0 context (not normative logic)'}:s)}
]);
export const simScenario=id=>SIMULATOR_SCENARIOS.find(s=>s.id===id)||SIMULATOR_SCENARIOS[0];
export const supportsSimulator=lesson=>lesson?.id===FIRST_SIM_LESSON;

const status=(id,state)=>({id,state});
function note(world,actor,message,state='info'){
  world.tick++;
  world.last={tick:world.tick,actor,message,state};
  world.events=[...world.events,world.last].slice(-80);
}
export function trackPoint(track,metres){
  const x=46+Math.max(0,Math.min(1000,metres))*1.0;
  if(track==='upper')return {x,y:118,angle:0};
  if(track==='diverge'){
    if(metres<=410)return {x,y:210,angle:0};
    if(metres>=520)return {x,y:300,angle:0};
    const p=(metres-410)/110;
    return {x,y:210+90*p,angle:Math.atan2(90,110)*180/Math.PI};
  }
  return {x,y:210,angle:0};
}
function sectionOccupied(section,train){
  const rear=train.position-TRACK_WORLD.trainLength;
  if(train.position<section.from||rear>section.to)return false;
  if(train.track===section.track)return true;
  if(train.track==='diverge'&&section.track==='main')return rear<=section.to;
  return false;
}
export function occupancy(world){
  return Object.fromEntries(TRACK_WORLD.sections.map(section=>[
    section.id,world.trains.filter(train=>sectionOccupied(section,train)).map(train=>train.id)
  ]));
}
const crossing=(track,from,to,bg)=>track===bg.track||
  (track==='diverge'&&bg.track==='main'&&bg.metres<=410);
export const antennaPosition=train=>train.position-train.direction*TRACK_WORLD.antennaOffset;
function balisesPassed(train,oldPosition,newPosition){
  const antennaBefore=oldPosition-train.direction*TRACK_WORLD.antennaOffset;
  const antennaAfter=newPosition-train.direction*TRACK_WORLD.antennaOffset;
  return TRACK_WORLD.balises.filter(bg=>
    crossing(train.track,oldPosition,newPosition,bg)&&
    (antennaBefore<bg.metres&&antennaAfter>=bg.metres||
      antennaBefore>bg.metres&&antennaAfter<=bg.metres));
}
function copy(world){return {
  ...world,inputs:{...world.inputs},trains:world.trains.map(t=>({...t})),
  balises:Object.fromEntries(Object.entries(world.balises).map(([id,reading])=>[id,{...reading}])),
  rbc:{...world.rbc,report:world.rbc.report?{...world.rbc.report}:null},
  route:{...world.route},point:{...world.point},ma:{...world.ma},
  events:[...world.events],lessonState:world.lessonState
};}
export function createSimulatorWorld(lesson,scenarioId='normal'){
  if(!supportsSimulator(lesson))throw new Error('No authored simulator world for '+(lesson?.id||'unknown'));
  const scenario=simScenario(scenarioId),lessonState=createLessonState(lesson.id);
  const world={
    lessonId:lesson.id,scenarioId:scenario.id,step:0,tick:0,lessonState,
    trains:[
      {id:'A',position:150,track:'diverge',direction:1,speed:38,level:scenario.initial.level||'L0',mode:'not modelled'},
      {id:'B',position:scenario.initial.otherPosition??860,track:scenario.initial.otherTrack||'upper',
        direction:scenario.initial.otherTrack==='diverge'?1:-1,speed:22,level:'not modelled',mode:'not modelled'}
    ],
    point:{position:'normal',locked:false,detected:lessonState.inputs.pointDetected},
    route:{status:'not requested',accepted:false,locked:false,reason:'Awaiting an IXL request'},
    balises:Object.fromEntries(TRACK_WORLD.balises.map(bg=>[bg.id,{count:0,lastTick:null}])),
    rbc:{session:'fixture connected',report:null,lastUpdate:null,exchange:'No report yet'},
    radio:{state:'fixture connected',source:'OBU position report via radio (not tower geolocation)'},
    ma:{status:'not issued',end:null,targetSpeed:null},
    events:[],last:null
  };
  note(world,'SimWorld','Fixture loaded: '+scenario.label,'info');
  return world;
}
export const hasNextSimulatorStep=world=>world.step<simScenario(world.scenarioId).steps.length;
export const currentSimulatorStep=world=>simScenario(world.scenarioId).steps[world.step]||null;
export function simulateNextStep(previous,lesson){
  if(!supportsSimulator(lesson)||previous.lessonId!==lesson.id)throw new Error('Lesson/world mismatch');
  const command=currentSimulatorStep(previous);
  if(!command)return previous;
  const world=copy(previous);
  world.step++;
  const train=id=>world.trains.find(t=>t.id===id);
  const accepted=()=>world.route.accepted&&world.route.locked;
  const blocked=(message)=>note(world,'SimWorld',message,'blocked');
  switch(command.kind){
    case 'input':{
      world.lessonState=stepLesson(world.lessonState,{type:'set',values:command.values});
      world.point.detected=world.lessonState.inputs.pointDetected;
      note(world,'Detection',command.label,'warning');
      break;
    }
    case 'restore-inputs':{
      world.lessonState=stepLesson(world.lessonState,{type:'restore'});
      world.point.detected=world.lessonState.inputs.pointDetected;
      note(world,'Maintainer',command.label,'warning');
      break;
    }
    case 'route-request':{
      const occ=occupancy(world);
      const competing=occ.TC2.some(id=>id!=='A');
      const clear=!competing;
      if(world.lessonState.inputs.routeClear!==clear)world.lessonState=
        stepLesson(world.lessonState,{type:'set',values:{routeClear:clear}});
      world.lessonState=stepLesson(world.lessonState,{type:'evaluate'});
      const snap=lessonSnapshot(world.lessonState);
      world.route.accepted=snap.phase==='ACTIVE';
      world.route.status=world.route.accepted?'proved (not yet locked)':'withheld';
      world.route.reason=snap.reason;
      if(!world.route.accepted){world.route.locked=false;world.point.locked=false;}
      note(world,'IXL',command.label+' — '+world.route.status,world.route.accepted?'valid':'blocked');
      break;
    }
    case 'point-lock':{
      if(!world.route.accepted){blocked('Point movement refused: route not proved');break;}
      world.lessonState=stepLesson(world.lessonState,{type:'progress'});
      if(world.lessonState.phase==='PROGRESS'){
        world.point.position='reverse';world.point.locked=true;world.route.locked=true;
        world.route.status='proved + locked';
        note(world,'IXL','P1 detected reverse; synthetic route lock held','valid');
      }else blocked('Point locking did not complete in lesson state');
      break;
    }
    case 'move':{
      const moving=train(command.train);
      if(!moving){blocked('Unknown train');break;}
      if(moving.id==='A'&&command.to>384&&!accepted()){
        blocked('Train movement beyond fixture approach refused: route not locked');break;
      }
      const movingForward=moving.direction<0?command.to<=moving.position:command.to>=moving.position;
      if(!movingForward){blocked('Unexpected movement direction in this scenario');break;}
      const old=moving.position;
      moving.position=command.to;
      if(Number.isFinite(command.speed))moving.speed=command.speed;
      for(const bg of balisesPassed(moving,old,moving.position)){
        const mark=world.balises[bg.id];
        mark.count++;mark.lastTick=world.tick+1;
        if(moving.id==='A')moving.lrbg=bg.id;
        note(world,'BTM','Train '+moving.id+' detected '+bg.id+' at fixture '+bg.metres+' m','info');
      }
      const occ=occupancy(world);
      if(moving.id==='B'&&occ.TC2.length===0&&world.route.status==='withheld')
        world.route.reason='Section now clear; fresh proof required';
      note(world,'Train '+moving.id,command.label,'info');
      break;
    }
    case 'position-report':{
      if(!accepted()||!train('A').lrbg){blocked('Position report needs accepted route and balise reference');break;}
      world.rbc.report={
        train:'A',front:train('A').position,lrbg:train('A').lrbg,
        speedKmh:train('A').speed,
        source:'OBU estimated position (balise reference + odometry)'
      };
      world.rbc.lastUpdate=world.tick+1;
      world.rbc.exchange='Position report received';
      note(world,'RBC','Reported front '+world.rbc.report.front+' m from OBU, referenced to '+world.rbc.report.lrbg,'info');
      break;
    }
    case 'ma-update':{
      if(!accepted()||!world.rbc.report){blocked('Teaching MA withheld: route proof or OBU position report absent');break;}
      world.ma={status:'fixture issued',end:1000,targetSpeed:0};
      world.rbc.exchange='Illustrative authority information sent';
      note(world,'RBC','Illustrative authority update to 1000 m — no Message 3 encoding','valid');
      break;
    }
    case 'level-transition':{
      if(!world.ma.end||!world.balises['BG-2'].count||train('A').position<TRACK_WORLD.levelBoundary.metres){
        blocked('Level example withheld: marker or authority context missing');break;
      }
      const from=train('A').level;
      train('A').level=command.to;
      note(world,'OBU','Teaching context '+from+' → '+command.to+' displayed; NOT SUBSET-026 transition rules','warning');
      break;
    }
    case 'route-release':{
      const occ=occupancy(world);
      if(occ.TC2.length||!world.route.locked){blocked('Route release refused while section occupied or unlocked');break;}
      world.lessonState=stepLesson(world.lessonState,{type:'progress'});
      world.point.locked=false;world.point.position='normal';world.route.locked=false;
      world.route.status='released';world.ma={status:'historical fixture',end:null,targetSpeed:null};
      note(world,'IXL','Fixture route released only after TC2 clear','valid');
      break;
    }
    default:throw new Error('Unknown simulator step type '+command.kind);
  }
  return world;
}
const display=x=>x===null||x===undefined?'—':String(x);
export function componentReadings(world,id){
  const first=world.trains[0],other=world.trains[1],occ=occupancy(world);
  const section=TRACK_WORLD.sections.find(s=>s.id===id);
  const bg=TRACK_WORLD.balises.find(s=>s.id===id);
  const signal=TRACK_WORLD.signals.find(s=>s.id===id);
  if(id==='train-A'||id==='train-B'){
    const t=id==='train-A'?first:other;
    return {status:'fixture',readings:[['Position',t.position+' m'],['Speed',t.speed+' km/h'],
      ['Route',t.track],['Direction',t.direction<0?'left':'right'],
      ['ETCS level',t.level],['LRBG',display(t.lrbg)]]};
  }
  if(section)return {status:occ[id].length?'occupied':'clear',
    readings:[['Track',section.track],['Section',section.from+'–'+section.to+' m'],
      ['Occupancy',occ[id].join(', ')||'none'],['Detector','fictional section sensor']]};
  if(bg)return {status:world.balises[id].count?'detected':'pending',
    readings:[['Position',bg.metres+' m'],['Track',bg.track],['Detection count',world.balises[id].count],
      ['Last passage tick',display(world.balises[id].lastTick)]]};
  if(signal)return {status:id==='S1'&&world.route.locked?'schematic proceed':'schematic stop',
    readings:[['Signal',id],['Display','illustrative, not a real aspect'],
      ['Route status',world.route.status]]};
  if(id==='P1')return {status:world.point.locked?'locked':world.point.detected?'unlocked':'fault',
    readings:[['Position',world.point.position],['Detected',world.point.detected?'yes':'no'],
      ['Locked',world.point.locked?'yes':'no'],['Route',world.route.status]]};
  if(id==='IXL')return {status:world.route.status,readings:[
    ['Lesson evaluation',world.lessonState.phase],['Route',world.route.status],
    ['Flank',world.lessonState.inputs.flank?'available':'missing'],
    ['Overlap',world.lessonState.inputs.overlap?'available':'missing'],
    ['Conflict free',world.lessonState.inputs.conflictFree?'yes':'no'],
    ['Reason',world.route.reason]]};
  if(id==='RBC')return {status:world.rbc.exchange,readings:[
    ['Session',world.rbc.session],['Reported front',world.rbc.report?world.rbc.report.front+' m':'not received'],
    ['Reference BG',world.rbc.report?.lrbg||'not received'],
    ['Report source','OBU via radio (not mast)'],
    ['Reported speed',world.rbc.report?.speedKmh===undefined?'not received':world.rbc.report.speedKmh+' km/h'],
    ['MA',world.ma.status],
    ['Last update','tick '+display(world.rbc.lastUpdate)]]};
  if(id==='radio')return {status:world.radio.state,readings:[
    ['Link',world.radio.state],['Purpose',world.radio.source],['Location measurements','none from mast']]};
  if(id==='boundary')return {status:first.level,readings:[
    ['Current level',first.level],['Marker',TRACK_WORLD.levelBoundary.metres+' m'],
    ['Transition','teaching event; full SRS rules not implemented']]};
  if(id==='BTM')return {status:first.lrbg?'reference acquired':'awaiting balise',readings:[
    ['Antenna position',antennaPosition(first)+' m'],
    ['Offset behind front',TRACK_WORLD.antennaOffset+' m (fixture)'],
    ['Last passed BG',first.lrbg||'none'],
    ['BG-1 count',world.balises['BG-1'].count],
    ['BG-2 count',world.balises['BG-2'].count]]};
  if(id==='ODOM')return {status:'sampled estimate',readings:[
    ['Train front',first.position+' m'],
    ['Estimate speed',first.speed+' km/h'],
    ['Movement direction',first.direction<0?'left':'right'],
    ['Last balise reference',first.lrbg||'not acquired'],
    ['Certified odometry','not modelled']]};
  if(id==='DMI')return {status:'teaching mock',readings:[
    ['Speed',first.speed+' km/h'],['Permitted speed','not modelled'],
    ['MA',world.ma.status],['Distance to EOA',world.ma.end===null?'not modelled':Math.max(0,world.ma.end-first.position)+' m'],
    ['Level',first.level],['Reported RBC position',world.rbc.report?.front??'none']]};
  return {status:'not available',readings:[]};
}
export function simulatorSummary(world){
  const lesson=lessonSnapshot(world.lessonState);
  return {scenario:simScenario(world.scenarioId),lesson,occupancy:occupancy(world),
    selectedStep:currentSimulatorStep(world),complete:!hasNextSimulatorStep(world),
    readings:Object.fromEntries(SIMULATOR_COMPONENTS.map(c=>[c.id,componentReadings(world,c.id)]))};
}
