/*
 * Source-anchored SimWorld educational labs. SUBSET-026 v4.0.0 terminology and
 * boundaries are referenced, never represented as a certified implementation.
 * The twelve labs each have a unique evaluator / progress handler in
 * authored-engine.js. Values are synthetic unless marked source-defined.
 */
import {COURSE_FIGURES} from './curriculum.js';

const B=(id,label,initial,from)=>({id,label,kind:'boolean',default:initial,from});
const N=(id,label,initial,from,unit='',min=0,max=3000)=>({id,label,kind:'number',default:initial,from,unit,min,max,step:1});
const T=(id,label,initial,from)=>({id,label,kind:'text',default:initial,from});
const MODULE='Authored operational chain';
const raw=[
  {
    key:'balise-link',title:'Balise linking & expectation window',chapter:3,clause:'3.4.4',
    figureIds:['3:Fig:1','3:Fig:2'],actors:[['link','Linking data','expected BG'],['balise','Balise antenna','detected BG'],['obu','ETCS OBU','consistency check'],['result','Reaction','selected by trackside']],
    sourceNote:'Linking announces BG identity, reference, location accuracy, direction and selected inconsistency reaction (§3.4.4.2.1–3).',
    goal:'Predict whether a linked balise group is observed inside its announced expectation window and in the required direction.',
    inputs:[T('expectedBg','Expected group identity','BG102','Linking information (trackside)'),T('detectedBg','Detected group identity','BG102','Balise antenna'),N('expectedAt','Announced position',500,'Linking information','m'),N('detectedAt','Observed position',505,'OBU odometry','m'),N('window','Illustrative expectation half-window',20,'Synthetic test parameter','m',0,200),T('expectedDirection','Linked passing direction','nominal','Linking information'),T('observedDirection','Observed passing direction','nominal','OBU'),B('linkingAvailable','Linking data stored',true,'ETCS OBU'),T('reaction','Trackside configured reaction','service-brake','Linking information')],
    faults:[{detectedBg:'BG999'},{detectedAt:560}],variation:{detectedAt:512},
    caveat:'Window width is a teaching input, not a derivation of the SUBSET-026 expectation window algorithm; no real trip/brake command is issued.'
  },
  {
    key:'confidence',title:'LRBG front-end confidence interval',chapter:3,clause:'3.6.4.1',
    figureIds:['3:Fig:13a','3:Fig:13b'],actors:[['lrbg','LRBG','location reference'],['odo','Odometry','reading error'],['obu','Position function','confidence interval'],['out','OBU / RBC','min/max safe front']],
    sourceNote:'§3.6.4.1.5 defines min/max safe front from Q_LOCACC, over/under-reading and optional train-length uncertainty.',
    goal:'Calculate the safe front-end interval and observe its growth when reading error increases.',
    inputs:[N('front','Estimated front position',400,'OBU odometry','m'),N('locAcc','LRBG location accuracy',4,'Linking / national values','m',0,100),N('over','Over-reading allowance',6,'OBU odometry','m',0,200),N('under','Under-reading allowance',8,'OBU odometry','m',0,200),N('trainOver','Train-length over uncertainty',0,'Train data','m',0,100),N('trainUnder','Train-length under uncertainty',0,'Train data','m',0,100),B('gamma','Applicable special length allowance γ=1',false,'Mode/train-data precondition'),B('lrbgKnown','LRBG reference available',true,'Balise identification')],
    faults:[{lrbgKnown:false},{locAcc:95,over:140}],variation:{under:25},
    caveat:'Simplified forward orientation and metre axis; formulas follow §3.6.4.1.5, but full odometer, relocation and mode applicability are not reproduced.'
  },
  {
    key:'position-report',title:'OBU position report → RBC',chapter:3,clause:'3.6.5.1',
    figureIds:['3:Fig:14'],actors:[['bg','LRBG','group identity'],['odo','OBU','distance + confidence'],['radio','Safe radio','transport'],['rbc','RBC','position report received']],
    sourceNote:'§3.6.5.1.2 lists distance, interval, LRBG ID, orientation, side, speed/standstill, integrity, motion direction and optional previous LRBG.',
    goal:'Inspect the fields required in an LRBG-referenced position report and why missing identity blocks this teaching exchange.',
    inputs:[T('lrbg','LRBG identity','BG102','Balise location reference'),N('distance','Estimated front from LRBG',300,'OBU odometry','m'),N('over','Distance to min safe front',12,'Position confidence','m'),N('under','Distance to max safe front',15,'Position confidence','m'),T('orientation','Train orientation','nominal','OBU / LRBG coordinate system'),T('runningDirection','Movement direction','nominal','OBU'),N('speed','Estimated speed',40,'OBU','km/h',0,200),B('integrity','Train integrity confirmed',true,'Train integrity function'),B('radio','Safe communication session available',true,'OBU / RBC')],
    faults:[{lrbg:''},{radio:false}],variation:{speed:70,distance:450},
    caveat:'A structured educational report, not a bit-level Packet 0/1 or Message 136 encoder; integrity=false is reported, not silently treated as identity failure.'
  },
  {
    key:'radio-session',title:'RBC session establishment & recovery',chapter:3,clause:'3.5.3–3.5.7',
    figureIds:['3:Fig:3','3:Fig:5'],actors:[['obu','OBU','session initiation'],['network','RMR bearer','network registered'],['rbc','RBC','session acceptance'],['link','OBU ↔ RBC','safe connection indication']],
    sourceNote:'§3.5 concerns establishing, maintaining and terminating a communication session; radio network behaviour is separately defined.',
    goal:'Distinguish network availability, a session request and an established safe radio connection; recover only with a new session.',
    inputs:[B('bearer','Radio bearer accessible',true,'GSM-R / FRMCS network'),B('registered','Radio network registration',true,'Radio terminal'),B('rbcReachable','RBC reachable',true,'Network routing'),B('versionCompatible','ETCS system version compatible',true,'OBU and RBC'),B('authAccepted','Safety connection validation passes (fixture)',true,'Radio safety layer'),T('rbcId','RBC identity','RBC-A','Trackside information')],
    faults:[{bearer:false},{authAccepted:false}],variation:{rbcId:'RBC-B'},
    caveat:'No Euroradio authentication/cryptographic exchange, national timers or bearer switching is implemented.'
  },
  {
    key:'start-mission',title:'Start of Mission: data readiness',chapter:5,clause:'5.4.1–5.4.3',
    figureIds:['5:Fig:1'],actors:[['driver','Driver','desk + ID'],['obu','OBU Stand By','stored data status'],['radio','Radio / level','contact available'],['mission','SoM procedure','next decision']],
    sourceNote:'§5.4.2 distinguishes valid, invalid and unknown stored data; §5.4.3.2 S0–D7 specifies decision stages.',
    goal:'See why desk state, driver identity, selected level and train data alter the next Start of Mission decision.',
    inputs:[B('standBy','On-board in Stand By',true,'OBU mode'),B('deskOpen','Driving desk open',true,'Driver interface'),T('driverId','Driver ID','DR01','Driver'),T('driverStatus','Driver ID status','valid','OBU stored data'),T('positionStatus','Position status','valid','OBU stored data'),T('levelStatus','Level status','valid','OBU stored data'),T('level','Selected level','2','ETCS level'),B('trainDataValid','Train data validated',true,'Driver / OBU'),B('radioRegistered','Radio network registered',true,'Radio network'),B('oldSession','Previous session still active',false,'OBU communication manager')],
    faults:[{driverStatus:'unknown'},{standBy:false}],variation:{driverId:'DR02'},
    caveat:'Only selected SoM decision points are shown. Does not reproduce full S0–Sx procedure, acknowledgement or level-dependent branching.'
  },
  {
    key:'ixl-boundary',title:'Interlocking proof → RBC boundary',chapter:2,clause:'2.4.1.3(d)',
    figureIds:[],actors:[['track','Track sections','occupancy'],['point','Point machine','detected + locked'],['ixl','Interlocking','route & overlap'],['rbc','RBC boundary','proved path only']],
    sourceNote:'SUBSET-026 Chapter 2 §2.4.1.3(d) classifies interlocking/control centres as external; this lesson uses a separately labelled synthetic IXL model.',
    goal:'Test why a dispatcher request is not itself authority, and why conflicting or unproved routes are refused.',
    inputs:[B('pointDetected','Point detected',true,'Point machine'),B('routeClear','Route track sections free',true,'Train detection'),B('flank','Flank protection',true,'Interlocking'),B('overlap','Overlap available',true,'Interlocking'),B('conflictFree','No conflicting route',true,'Route locking'),B('approachOccupied','Approach track occupied',false,'Train detection'),B('request','Dispatcher route request',true,'TMS / signaller')],
    faults:[{pointDetected:false},{conflictFree:false}],variation:{approachOccupied:true},
    caveat:'NOT a SUBSET-026 interlocking algorithm. Based on generic route proving concepts; site control tables and national rules remain external.'
  },
  {
    key:'movement-authority',title:'MA end, EOA/LOA & change proposal',chapter:3,clause:'3.8.1–3.8.6',
    figureIds:['3:Fig:17','3:Fig:23a','3:Fig:23b'],actors:[['ixl','IXL','safe route boundary'],['position','OBU','reported position'],['rbc','RBC','MA proposal'],['obu','OBU','EOA / LOA supervision']],
    sourceNote:'§3.8.1.1 distinguishes EOA (zero end target speed) from LOA (nonzero); MA update and cooperative shortening are separate behaviours.',
    goal:'Distinguish EOA versus LOA, reject ends behind the front, and show why shortening needs its own procedure.',
    inputs:[N('front','Reported train front',300,'OBU position report','m'),N('proposedEnd','Proposed MA end',900,'RBC trackside route data','m'),N('currentEnd','Previously issued MA end',600,'OBU / RBC state','m'),N('targetSpeed','Speed at proposed end',0,'RBC MA data','km/h',0,160),B('routeProved','Route proven',true,'Interlocking'),B('radio','Safe communication session',true,'RBC / OBU'),B('positionAccepted','Position report accepted',true,'RBC'),B('shorteningAck','Cooperative shortening acceptance (fixture)',false,'OBU / RBC exchange')],
    faults:[{routeProved:false},{proposedEnd:200}],variation:{targetSpeed:40,proposedEnd:950},
    caveat:'This is a proposal/decision teaching model; not the real Message 3, MA section timer logic or cooperative shortening protocol.'
  },
  {
    key:'speed-gradient',title:'Static speed restrictions & gradient inputs',chapter:3,clause:'3.11–3.12',
    figureIds:['3:Fig:26','3:Fig:27','3:Fig:39'],actors:[['track','Trackside','SSP/TSR + gradient'],['train','Train data','maximum speed'],['obu','OBU','restriction selection'],['out','Speed supervision','ceiling at sample']],
    sourceNote:'§3.11 defines speed restriction categories; Figure 39 illustrates MRSP selection. Gradient information is an independent input to braking.',
    goal:'Identify the most restrictive applicable speed at one location while keeping gradient as a separate braking input.',
    inputs:[N('staticSpeed','Static line speed',100,'Trackside SSP','km/h',0,250),N('temporarySpeed','Temporary speed restriction',70,'Trackside TSR','km/h',0,250),N('trainSpeed','Maximum train speed',120,'Train data','km/h',0,250),N('modeSpeed','Mode-related speed limit',90,'National / trackside mode data','km/h',0,250),N('gradient','Gradient signed',-8,'Trackside gradient profile','‰',-40,40),B('profileValid','Profile data accepted',true,'OBU completeness check'),B('trainData','Train limits available',true,'OBU train data')],
    faults:[{profileValid:false},{trainData:false}],variation:{temporarySpeed:45,gradient:14},
    caveat:'Point-sampled minimum-of-limits demonstrator; real spatial MRSP, gradient compensation, targets and mode exceptions must follow detailed SUBSET-026.'
  },
  {
    key:'brake-target',title:'Braking target supervision margin',chapter:3,clause:'3.13.1–3.13.9',
    figureIds:['3:Fig:28','3:Fig:40','3:Fig:45'],actors:[['train','Train','speed + brake data'],['target','Trackside target','speed + distance'],['obu','OBU','deceleration model'],['dmi','DMI','supervision status']],
    sourceNote:'§3.13.8 defines a speed-at-location target, and specifies piecewise deceleration-dependent curves; this lesson uses an explicitly non-normative toy example.',
    goal:'Explore why distance, speed, deceleration and brake build-up affect margin to a stopping target.',
    inputs:[N('speed','Current speed',65,'OBU speed estimate','km/h',0,200),N('targetSpeed','Target speed at location',0,'Target profile','km/h',0,160),N('distance','Distance to target',700,'OBU position + location','m',0,3000),N('decel','Illustrative effective deceleration',0.8,'Synthetic train brake example','m/s²',0.1,3),N('buildUp','Illustrative brake build-up delay',3,'Synthetic brake example','s',0,20),B('brakeDataValid','Brake characteristics available',true,'Train data'),B('targetKnown','Supervised target available',true,'OBU')],
    faults:[{brakeDataValid:false},{targetKnown:false}],variation:{distance:170,speed:95},
    caveat:'Uses (v²−v_target²)/(2a)+v*t as a pedagogical approximation, NOT the ETCS EBD/SBD curve or safe braking recommendation.'
  },
  {
    key:'mode-transition',title:'Mode conditions & transition candidate',chapter:4,clause:'4.4–4.8',
    figureIds:['4:Fig:1','4:Fig:2'],actors:[['obu','OBU','current mode'],['inputs','Trackside/train','MA + data'],['table','Mode filter','candidate conditions'],['dmi','DMI','mode indication']],
    sourceNote:'Chapter 4 identifies modes, active functions, transition and information-filtering tables; the full tables, not the toy subset, define real transitions.',
    goal:'Compare a small FS/SR/TR candidate with prerequisites and examine why mode changes cannot be guessed.',
    inputs:[T('currentMode','Current mode','SB','OBU mode manager'),T('requestedMode','Candidate next mode','FS','Teaching input (not order)'),B('authority','Valid MA available',true,'OBU supervision'),B('trainData','Train data accepted',true,'OBU'),B('positionKnown','Position accepted',true,'OBU'),B('tripCommand','Trip condition active',false,'OBU / trackside')],
    faults:[{authority:false},{tripCommand:true}],variation:{requestedMode:'SR',authority:false},
    caveat:'This models prerequisite discussion, not the normative transition matrix or conditions for selecting FS/SR/TR. Never use to drive an OBU.'
  },
  {
    key:'emergency',title:'Emergency stop acceptance & revocation',chapter:3,clause:'3.10.2–3.10.3',
    figureIds:[],actors:[['rbc','RBC','stop message + ID'],['position','OBU','min safe front'],['obu','OBU','accept/trip/retain'],['dmi','DMI','stop / MA blocked']],
    sourceNote:'§3.10.2.2 conditional stop compared with min safe front; §3.10.2.3 unconditional stop trips immediately; §3.10.2.4 bars MA until revocation.',
    goal:'Compare conditional versus unconditional stop, reject a passed stop location and match revocation to the accepted message.',
    inputs:[T('type','Stop message type','conditional','RBC/trackside'),N('stopAt','Conditional stop location',500,'RBC relative to LRBG','m'),N('minSafeFront','Min safe front',300,'Position confidence','m'),N('oldEOA','Existing EOA',900,'On-board MA','m'),N('messageId','Emergency message ID',22,'Trackside','',0,255),N('revokeId','Revocation references ID',0,'Trackside','',0,255),B('revocation','Revocation received',false,'RBC'),B('maProposed','New MA proposed',true,'RBC')],
    faults:[{stopAt:200},{type:'invalid'}],variation:{type:'unconditional'},
    caveat:'Conditional stop cases simplified to a location at/before current EOA; no actual trip brake command, complete SvL/overlap logic, or acknowledgement sequence.'
  },
  {
    key:'rbc-handover',title:'RBC/RBC handover preparation',chapter:3,clause:'3.15.1',
    figureIds:[],actors:[['ixl','Route set','RBC boundary'],['handover','Handing-over RBC','train info'],['accept','Accepting RBC','route information'],['obu','OBU','RBC transition']],
    sourceNote:'§3.15.1.1–3.15.1.2 distinguishes Handing Over and Accepting RBC, train identity/data, route info and session preparation.',
    goal:'Understand what the accepting RBC needs before a boundary crossing and why an unprepared handover cannot be treated as complete.',
    inputs:[T('oldRbc','Supervising RBC','RBC-A','OBU state'),T('newRbc','Accepting RBC','RBC-B','RBC transition order'),B('routeToBorder','Route established to RBC border',true,'Interlocking / handing-over RBC'),B('trainInfo','Train identity, version, running data available',true,'Handing-over RBC'),B('acceptingReady','Accepting RBC prepared',true,'RBC/RBC interface'),B('routeInfo','Required route information available',true,'Accepting RBC'),B('onboardSession','OBU can establish accepting session',true,'OBU / radio')],
    faults:[{acceptingReady:false},{trainInfo:false}],variation:{onboardSession:false},
    caveat:'Shows handover information dependencies only. This is NOT the full RBC/RBC FIS (SUBSET-039/098), messaging or safe communications.'
  },
];
const commands=[
  {id:'evaluate',label:'Evaluate source conditions',tone:'blue',help:'Apply this function-specific educational evaluator'},
  {id:'progress',label:'Process next event',tone:'green',help:'Advance only the currently active learning function'},
  {id:'disrupt',label:'Inject primary fault',tone:'red',help:'Change the primary guard input; see whether it remains safe'},
  {id:'restore',label:'Restore + recheck required',tone:'neutral',help:'Restore starting signals; an explicit evaluation is still required'},
  {id:'reset',label:'Reset lesson',tone:'neutral',help:'Clear local scenario state'},
];
const flowOf=items=>{
  const labels=items.map(([id,label])=>`${id.toUpperCase()}[${label.replace(/[^\w \-\/]/g,'')}]`);
  return `flowchart LR\n  ${labels.join(' --> ')}`;
};
const stateFlow=label=>`stateDiagram-v2\n  [*] --> IDLE\n  IDLE --> ACTIVE: ${label} guards pass\n  IDLE --> BLOCKED: missing input / inconsistency\n  ACTIVE --> PROGRESS: process relevant event\n  PROGRESS --> COMPLETE: next verified event\n  ACTIVE --> REVIEW: signal changed\n  PROGRESS --> REVIEW: compound fault burst\n  REVIEW --> BLOCKED: re-evaluation fails\n  BLOCKED --> RECOVERED: restore inputs\n  RECOVERED --> ACTIVE: explicit re-evaluation`;
function scenarios(d){
  const [primary,secondary]=d.faults;
  return [
    {id:'simple-valid',tier:'simple',label:`Normal ${d.key} result`,kind:'ok',steps:[{action:'evaluate'}],expect:{phase:'ACTIVE'}},
    {id:'simple-refuse',tier:'simple',label:'Single bad input',kind:'alert',steps:[{set:primary},{action:'evaluate'}],expect:{phase:'BLOCKED'}},
    {id:'medium-sequence',tier:'medium',label:'Process the function twice',kind:'ok',steps:[{action:'evaluate'},{action:'progress'},{action:'progress'}],expect:{phase:'COMPLETE'}},
    {id:'medium-variation',tier:'medium',label:'Vary source parameters',kind:'ok',steps:[{set:d.variation},{action:'evaluate'},{action:'progress'}],expect:{phase:'PROGRESS'}},
    {id:'busy-compound',tier:'busy',label:'Concurrent inputs: failure then restore',kind:'alert',steps:[{action:'evaluate'},{action:'progress'},{burst:[{actor:'Trackside',set:primary},{actor:'Independent source',set:secondary}]},{action:'evaluate'},{action:'restore'},{action:'evaluate'},{action:'progress'}],expect:{phase:'PROGRESS',mustVisit:['REVIEW','BLOCKED']}},
    {id:'busy-cascade',tier:'busy',label:'Faults before activation / recovery',kind:'alert',steps:[{burst:[{actor:'Subsystem A',set:secondary},{actor:'Subsystem B',set:primary}]},{action:'evaluate'},{action:'restore'},{action:'evaluate'},{action:'progress'},{action:'progress'}],expect:{phase:'COMPLETE',mustVisit:['BLOCKED']}},
  ];
}
const x=(items,index)=>({
  id:`authored-${items.key}`,key:items.key,authoredRule:items.key,status:'authored',number:String(index+4).padStart(3,'0'),
  title:items.title,short:items.title,icon:index%3===0?'◈':index%3===1?'⌁':'🚦',
  module:'00A',moduleTitle:MODULE,chapter:items.chapter,clause:items.clause,
  goal:items.goal,summary:`SUBSET-026-${items.chapter} §${items.clause}: ${items.sourceNote}`,
  boundary:`${items.caveat} SimWorld fixture is self-contained; no operational or safety certification.`,
  source:[`SUBSET-026-${items.chapter} v4.0.0 §${items.clause}`,items.sourceNote,items.key==='ixl-boundary'?'Interlocking logic external: national/IM approved control tables needed.':'TrainSim: synthetic model inputs, not official values.'],
  sourceFigures:items.figureIds.map(id=>COURSE_FIGURES.find(f=>f.id===id)).filter(Boolean).map(f=>({id:f.id,figure:f.figure,caption:f.caption,chapter:f.chapter,page:f.page,scope:'annotated teaching re-expression'})),
  inputs:items.inputs,actions:commands,scenarios:scenarios(items),
  faultVectors:items.faults,variant:items.variation,
  diagrams:{flow:flowOf(items.actors),state:stateFlow(items.title.toLowerCase()),
    actors:items.actors.map(([id,txt,tag],n)=>({id,text:txt,tag,x:8+n*178,y:76})),
    arrows:items.actors.slice(0,-1).map(([id],n)=>[id,items.actors[n+1][0]]),
    stages:['IDLE','ACTIVE','PROGRESS','COMPLETE','BLOCKED','REVIEW','RECOVERED']},
});
export const AUTHORED_LESSONS=raw.map(x);
export const authoredById=id=>AUTHORED_LESSONS.find(l=>l.id===id);