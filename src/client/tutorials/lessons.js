import {GENERATED_LESSONS} from './curriculum.js';
import {AUTHORED_LESSONS} from './authored-lessons.js';

/**
 * Fictitious SimWorld teaching fixtures; no network access, live source DB or runtime
 * coupling. Each lesson pins the cited reference and explicitly states its scope.
 * Source notes are labels, not copied normative requirements or certifications.
 */
const CORE_LESSONS = [
  {
    id:'ma', number:'01', title:'Movement Authority (MA)', short:'Movement Authority', icon:'🚆',
    goal:'See how trackside evidence gates a proposed MA, then watch the train approach its authority boundary.',
    summary:'The RBC uses a proved route, location and communications inputs to send an illustrative MA to the OBU.',
    boundary:'Teaching abstraction: no real brake-curve calculation, radio packet encoder or automatic MA revocation.',
    source:['SUBSET-026-3 v4.0.0 §3.7–3.8 (MA, EOA/LOA)', 'SUBSET-026-8 v4.0.0 §8.7.2 (Message 3)'],
    inputs:[
      {id:'front', label:'Train front', unit:'m', kind:'number', min:0,max:2000,step:50,default:300,from:'OBU position report'},
      {id:'end', label:'Proposed MA end', unit:'m', kind:'number',min:100,max:2000,step:50,default:900,from:'RBC route limit'},
      {id:'target',label:'Target speed at MA end',unit:'km/h',kind:'number',min:0,max:160,step:10,default:0,from:'MA end section'},
      {id:'permitted',label:'Current permitted speed',unit:'km/h',kind:'number',min:0,max:160,step:10,default:40,from:'Simplified speed profile'},
      {id:'routeProved',label:'Route proved / locked',kind:'boolean',default:true,from:'Interlocking'},
      {id:'sectionClear',label:'Protected section clear',kind:'boolean',default:true,from:'Train detection'},
      {id:'positionKnown',label:'Train position accepted',kind:'boolean',default:true,from:'OBU / RBC'},
      {id:'radioSafe',label:'Safe radio session active',kind:'boolean',default:true,from:'RBC ↔ OBU'},
      {id:'emergencyReceived',label:'Emergency stop received by OBU',kind:'boolean',default:false,from:'Trackside command'},
    ],
    actions:[
      {id:'issue',label:'Issue / update MA',tone:'blue',help:'RBC checks evidence and emits the authority'},
      {id:'advance',label:'Advance train +100 m',tone:'green',help:'Advance simulated front, never beyond the MA end'},
      {id:'occupy',label:'Occupy section ahead',tone:'red',help:'Inject a new occupied-section condition'},
      {id:'restore',label:'Restore & recheck',tone:'neutral',help:'Clear injected fault; request a new MA'},
      {id:'reset',label:'Reset',tone:'neutral',help:'Restore initial inputs and event history'},
    ],
    diagrams:{
      flow:`flowchart LR\n  IXL[Interlocking] -->|Route proved| RBC[RBC]\n  TRACK[Train detection] -->|Section clear| RBC\n  OBU[OBU] -->|Position report| RBC\n  RBC -->|MA message 3| OBU\n  OBU --> DMI[Driver interface]`,
      state:`stateDiagram-v2\n  [*] --> WAITING\n  WAITING --> READY: valid inputs\n  READY --> MA_GRANTED: issue MA\n  WAITING --> WITHHELD: preconditions fail\n  WITHHELD --> READY: inputs restored\n  MA_GRANTED --> TRAIN_RUNNING: advance train\n  TRAIN_RUNNING --> AT_BOUNDARY: reaches MA end\n  MA_GRANTED --> REVIEW: evidence changed\n  REVIEW --> MA_GRANTED: recheck & reissue\n  TRAIN_RUNNING --> STOP_REQUIRED: emergency delivered`,
      actors:[
        {id:'ixl',text:'Interlocking',tag:'route proved',x:6,y:30},
        {id:'track',text:'Detection',tag:'track clear',x:6,y:108},
        {id:'rbc',text:'RBC',tag:'assess / issue',x:190,y:68},
        {id:'obu',text:'OBU',tag:'read / supervise',x:372,y:68},
        {id:'dmi',text:'DMI',tag:'driver display',x:554,y:68},
      ],
      arrows:[['ixl','rbc'],['track','rbc'],['rbc','obu'],['obu','dmi']],
      stages:['WAITING','READY','MA_GRANTED','TRAIN_RUNNING','AT_BOUNDARY','WITHHELD','REVIEW','STOP_REQUIRED'],
    },
    scenarios:[
      {id:'happy',label:'Happy path',kind:'ok',steps:[{action:'issue'},{action:'advance'},{action:'advance'}],expect:{phase:'TRAIN_RUNNING',front:500,remaining:400}},
      {id:'unproved',label:'Route not proved',kind:'alert',steps:[{set:{routeProved:false}},{action:'issue'}],expect:{phase:'WITHHELD',maIssued:false}},
      {id:'occupied',label:'Section becomes occupied',kind:'alert',steps:[{action:'issue'},{action:'occupy'}],expect:{phase:'REVIEW',maIssued:true}},
      {id:'radio',label:'Radio connection lost',kind:'alert',steps:[{action:'issue'},{set:{radioSafe:false}}],expect:{phase:'REVIEW',maIssued:true}},
      {id:'emergency',label:'Emergency stop',kind:'alert',steps:[{action:'issue'},{set:{emergencyReceived:true}}],expect:{phase:'STOP_REQUIRED',maIssued:false}},
    ],
  },
  {
    id:'interlocking',number:'02',title:'Route proving (IXL)',short:'Route proving',icon:'🚦',
    goal:'Find why a route request can be refused even when a signaller requests it.',
    summary:'An illustrative route requires point detection, free track, overlap and flank protection before locking.',
    boundary:'Synthetic route proving; no approved site control table, approach-locking timer or SIL assessment.',
    source:['SUBSET-026-2 v4.0.0 §2.4.1.3(d) (IXL external to ETCS)', 'OSM Interlocking reference configurations (separate third-party examples)'],
    inputs:[
      {id:'pointProved',label:'Point P1 detected',kind:'boolean',default:true,from:'Point machine'},
      {id:'trackClear',label:'Track T1 clear',kind:'boolean',default:true,from:'Train detection'},
      {id:'overlapClear',label:'Overlap clear',kind:'boolean',default:true,from:'Track detection'},
      {id:'flankLocked',label:'Flank protection set',kind:'boolean',default:true,from:'Interlocking'},
      {id:'conflictFree',label:'No conflicting route',kind:'boolean',default:true,from:'Route control'},
      {id:'approachOccupied',label:'Approach section occupied',kind:'boolean',default:false,from:'Approach detector'},
    ],
    actions:[
      {id:'request',label:'Request route R_AB',tone:'blue',help:'Prove all protection conditions'},
      {id:'enter',label:'Train enters route',tone:'green',help:'Show occupancy while route remains locked'},
      {id:'clear',label:'Train clears route',tone:'green',help:'Release after train clears route'},
      {id:'cancel',label:'Cancel route',tone:'red',help:'Test approach-occupied cancellation guard'},
      {id:'reset',label:'Reset',tone:'neutral',help:'Restore starting conditions'},
    ],
    diagrams:{
      flow:`flowchart LR\n  P[Point detection] --> IXL[Interlocking]\n  T[Track circuits] --> IXL\n  O[Overlap and flank] --> IXL\n  C[Conflict table] --> IXL\n  IXL -->|Route proved / refused| RBC[RBC boundary]`,
      state:`stateDiagram-v2\n  [*] --> IDLE\n  IDLE --> ROUTE_LOCKED: all checks pass\n  IDLE --> ROUTE_DENIED: check fails\n  ROUTE_LOCKED --> TRAIN_OCCUPYING: train enters\n  TRAIN_OCCUPYING --> RELEASED: train clears\n  ROUTE_LOCKED --> APPROACH_HELD: cancel while approach occupied\n  ROUTE_LOCKED --> REVIEW: protection changed\n  ROUTE_DENIED --> IDLE: conditions restored\n  ROUTE_LOCKED --> RELEASED: cancel / no approach`,
      actors:[
        {id:'point',text:'Point P1',tag:'detected',x:6,y:30},
        {id:'track',text:'Track T1',tag:'clear',x:6,y:108},
        {id:'ixl',text:'Interlocking',tag:'check & lock',x:190,y:68},
        {id:'rbc',text:'RBC boundary',tag:'safe route input',x:392,y:68},
      ],
      arrows:[['point','ixl'],['track','ixl'],['ixl','rbc']],
      stages:['IDLE','ROUTE_LOCKED','TRAIN_OCCUPYING','RELEASED','ROUTE_DENIED','REVIEW','APPROACH_HELD'],
    },
    scenarios:[
      {id:'prove',label:'Route proves',kind:'ok',steps:[{action:'request'}],expect:{phase:'ROUTE_LOCKED',routeLocked:true}},
      {id:'point',label:'Point failed',kind:'alert',steps:[{set:{pointProved:false}},{action:'request'}],expect:{phase:'ROUTE_DENIED',routeLocked:false}},
      {id:'conflict',label:'Conflicting route',kind:'alert',steps:[{set:{conflictFree:false}},{action:'request'}],expect:{phase:'ROUTE_DENIED',routeLocked:false}},
      {id:'release',label:'Train clears',kind:'ok',steps:[{action:'request'},{action:'enter'},{action:'clear'}],expect:{phase:'RELEASED',routeLocked:false}},
    ],
  },
  {
    id:'radio',number:'03',title:'RBC radio session',short:'RBC communications',icon:'📡',
    goal:'See the difference between a communication session and an accepted train position report.',
    summary:'A simplified train-to-trackside flow establishes a radio session, then submits a position report.',
    boundary:'A teaching transport sequence, not an implementation of Euroradio security or timeouts.',
    source:['SUBSET-026-3 v4.0.0 §3.5 (radio sessions)', 'SUBSET-026-8 v4.0.0 §8.6.4 (Message 136)'],
    inputs:[
      {id:'trainId',label:'Train identifier',kind:'text',default:'T001',from:'OBU'},
      {id:'front',label:'Train front',unit:'m',kind:'number',min:0,max:2000,step:50,default:300,from:'Position estimation'},
      {id:'radioAvailable',label:'Radio bearer available',kind:'boolean',default:true,from:'Radio network'},
      {id:'versionCompatible',label:'ETCS versions compatible',kind:'boolean',default:true,from:'OBU ↔ RBC'},
      {id:'positionKnown',label:'Position reference known',kind:'boolean',default:true,from:'Balise / odometry'},
    ],
    actions:[
      {id:'connect',label:'Establish session',tone:'blue',help:'Check bearer and compatible version'},
      {id:'report',label:'Send position report',tone:'green',help:'Send a new position after session establishment'},
      {id:'drop',label:'Drop radio bearer',tone:'red',help:'Simulate loss of communications'},
      {id:'restore',label:'Restore bearer',tone:'neutral',help:'Restore radio and start session again'},
      {id:'reset',label:'Reset',tone:'neutral',help:'Restore starting conditions'},
    ],
    diagrams:{
      flow:`flowchart LR\n  BAL[Balise / odometry] --> OBU[OBU]\n  OBU -->|Session request| RBC[RBC]\n  RBC -->|Session response| OBU\n  OBU -->|Position report| RBC\n  RBC -->|Report acceptance| OBU`,
      state:`stateDiagram-v2\n  [*] --> DISCONNECTED\n  DISCONNECTED --> CONNECTED: compatible / bearer available\n  DISCONNECTED --> REFUSED: connection failed\n  CONNECTED --> REPORT_RECEIVED: position report\n  CONNECTED --> REPORT_BLOCKED: missing position reference\n  REPORT_BLOCKED --> REPORT_RECEIVED: valid report\n  CONNECTED --> RADIO_LOST: bearer lost\n  REPORT_RECEIVED --> RADIO_LOST: bearer lost\n  RADIO_LOST --> CONNECTED: reconnect`,
      actors:[
        {id:'balise',text:'Balise / odometry',tag:'location reference',x:6,y:70},
        {id:'obu',text:'OBU',tag:'session / report',x:220,y:70},
        {id:'rbc',text:'RBC',tag:'accept / reply',x:445,y:70},
      ],
      arrows:[['balise','obu'],['obu','rbc']],
      stages:['DISCONNECTED','CONNECTED','REPORT_RECEIVED','REPORT_BLOCKED','RADIO_LOST','REFUSED'],
    },
    scenarios:[
      {id:'session',label:'Session + report',kind:'ok',steps:[{action:'connect'},{action:'report'}],expect:{phase:'REPORT_RECEIVED',session:true}},
      {id:'incompatible',label:'Version incompatible',kind:'alert',steps:[{set:{versionCompatible:false}},{action:'connect'}],expect:{phase:'REFUSED',session:false}},
      {id:'drop',label:'Radio lost',kind:'alert',steps:[{action:'connect'},{action:'drop'}],expect:{phase:'RADIO_LOST',session:false}},
      {id:'unknown',label:'Position unknown',kind:'alert',steps:[{action:'connect'},{set:{positionKnown:false}},{action:'report'}],expect:{phase:'REPORT_BLOCKED',session:true}},
    ],
  },
 ];
// Three hand-tuned pilot lessons remain first. Every ESIG source lesson follows
// in SUBSET-026 order, with independent simple / medium / busy scenarios.
for (const lesson of CORE_LESSONS){
  lesson.module='00';lesson.moduleTitle='Featured learning labs';lesson.status='authored';
  lesson.sourceFigures=[];
  lesson.scenarios=lesson.scenarios.map(s=>({...s,tier:s.tier??'simple'}));
  const additional=lesson.id==='ma'?[
    {id:'ma-medium',tier:'medium',label:'Issue + advance twice',kind:'ok',steps:[{action:'issue'},{action:'advance'},{action:'advance'}],expect:{phase:'TRAIN_RUNNING'}},
    {id:'ma-busy',tier:'busy',label:'Radio & route failure cascade',kind:'alert',steps:[{action:'issue'},{set:{radioSafe:false,routeProved:false}},{action:'issue'},{set:{radioSafe:true,routeProved:true}},{action:'issue'}],expect:{phase:'MA_GRANTED'}},
  ]:lesson.id==='interlocking'?[
    {id:'ixl-medium',tier:'medium',label:'Prove → traverse → release',kind:'ok',steps:[{action:'request'},{action:'enter'},{action:'clear'}],expect:{phase:'RELEASED'}},
    {id:'ixl-busy',tier:'busy',label:'Conflict & flank fault',kind:'alert',steps:[{action:'request'},{set:{flankLocked:false,conflictFree:false}},{action:'cancel'},{set:{flankLocked:true,conflictFree:true}},{action:'request'}],expect:{phase:'ROUTE_LOCKED'}},
  ]:[
    {id:'radio-medium',tier:'medium',label:'New position report',kind:'ok',steps:[{action:'connect'},{action:'report'},{set:{front:450}},{action:'report'}],expect:{phase:'REPORT_RECEIVED'}},
    {id:'radio-busy',tier:'busy',label:'Drop and re-establish',kind:'alert',steps:[{action:'connect'},{action:'report'},{action:'drop'},{action:'restore'},{action:'connect'},{action:'report'}],expect:{phase:'REPORT_RECEIVED'}},
  ];
  lesson.scenarios.push(...additional);
}
// The generated source coverage catalogue is not equivalent to individually
// modelled functional learning labs. Keep both discoverable, with clear status.
export const LESSONS=[...CORE_LESSONS,...AUTHORED_LESSONS,...GENERATED_LESSONS.map((l,i)=>({...l,status:'scaffold',number:String(i+16).padStart(3,'0')}))];
export const LESSON_COUNTS={authored:CORE_LESSONS.length+AUTHORED_LESSONS.length,scaffold:GENERATED_LESSONS.length};
export const lessonById=id=>LESSONS.find(l=>l.id===id)||LESSONS[0];
export const lessonIndex=id=>Math.max(0,LESSONS.findIndex(l=>l.id===id));
