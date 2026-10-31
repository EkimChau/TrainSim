/* Reusable DOM-SVG symbol library + junction renderer.
 * Symbols deliberately resemble common railway schematic conventions, but
 * are not an infrastructure-manager-approved signalling plan.
 */
import {TRACK_WORLD,VECTOR_STYLE,trackPoint,occupancy} from './world.js';
const NS='http://www.w3.org/2000/svg';
const C=VECTOR_STYLE;
const svg=(tag,attrs={},content)=>{
  const e=document.createElementNS(NS,tag);
  for(const [key,val] of Object.entries(attrs))if(val!==undefined&&val!==null)e.setAttribute(key,String(val));
  if(content!==undefined)e.textContent=String(content);
  return e;
};
const add=(root,...items)=>{root.append(...items);return root;};
const path=(root,d,color=C.ink,width=2,extra={})=>add(root,svg('path',{d,fill:'none',stroke:color,'stroke-width':width,...extra}));
const rect=(root,x,y,w,h,fill='#fff7e8',r=3,extra={})=>add(root,svg('rect',{x,y,width:w,height:h,rx:r,fill,...extra}));
const line=(root,x1,y1,x2,y2,color=C.ink,width=2,extra={})=>
  add(root,svg('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,...extra}));
const label=(root,x,y,value,className='sim-svg-label',anchor='start')=>
  add(root,svg('text',{x,y,class:className,'text-anchor':anchor},value));
function symbol(defs,id,paint){
  const sym=svg('symbol',{id,viewBox:'0 0 100 48'});
  paint(sym);defs.append(sym);
}
export function installRailSymbols(root){
  const defs=svg('defs');
  symbol(defs,'sim-symbol-train',g=>{
    // A clean side-profile with recognizable pantograph, cab and wheelsets.
    rect(g,2,11,96,28,'#e2ebed',6,{stroke:C.ink,'stroke-width':2});
    add(g,svg('path',{d:'M81 11 L97 20 L97 35 L81 39 Z',fill:'#dce5e8',stroke:C.ink,'stroke-width':1.4}));
    for(let x=12;x<76;x+=17)rect(g,x,16,13,11,'#6a9ab0',2);
    rect(g,83,17,10,11,'#6a9ab0',2);
    rect(g,3,34,88,3,'#ae4c50',0);
    for(const x of [18,76])add(g,svg('circle',{cx:x,cy:41,r:6,fill:'#2f414e',stroke:'#182635','stroke-width':1}));
    path(g,'M40 11 L48 3 L57 11 M48 3 L48 0',C.ink,1.5);
  });
  symbol(defs,'sim-symbol-balise',g=>{
    rect(g,23,19,55,17,'#efc34a',2,{stroke:'#6c5623','stroke-width':2});
    line(g,31,23,69,23,'#8e6d29',2);
    line(g,31,30,69,30,'#8e6d29',2);
    path(g,'M50 14 Q61 4 72 14 M50 10 Q62 -3 76 10',C.radio,1.5);
  });
  symbol(defs,'sim-symbol-signal',g=>{
    line(g,49,12,49,47,C.ink,4);
    rect(g,37,4,24,33,'#e7e9e7',5,{stroke:C.ink,'stroke-width':2});
    add(g,svg('circle',{cx:49,cy:14,r:6,fill:'#485662'}));
    add(g,svg('circle',{cx:49,cy:27,r:6,fill:'#485662'}));
  });
  symbol(defs,'sim-symbol-ixl',g=>{
    rect(g,7,17,84,28,'#e0dfd0',2,{stroke:C.ink,'stroke-width':2});
    add(g,svg('path',{d:'M4 17 L50 4 L96 17 Z',fill:'#d0c4a6',stroke:C.ink,'stroke-width':2}));
    for(const x of [20,41,62,83])rect(g,x,22,11,12,'#9dbcc6',1);
  });
  symbol(defs,'sim-symbol-rbc',g=>{
    for(const x of [9,39,69]){
      rect(g,x,6,23,39,'#7fa8c5',2,{stroke:C.ink,'stroke-width':2});
      for(const y of [15,24,33])line(g,x+4,y,x+19,y,'#233b4c',2);
    }
  });
  symbol(defs,'sim-symbol-radio',g=>{
    line(g,49,4,49,47,C.ink,3);
    path(g,'M49 6 L27 46 L71 46 Z',C.ink,2);
    line(g,36,31,63,31,C.ink,1);
    path(g,'M39 6 Q49 -5 59 6 M32 3 Q49 -15 66 3',C.radio,2);
  });
  symbol(defs,'sim-symbol-axle',g=>{
    line(g,15,25,85,25,C.ink,6);
    add(g,svg('circle',{cx:25,cy:25,r:10,fill:'none',stroke:C.ink,'stroke-width':3}));
    add(g,svg('circle',{cx:75,cy:25,r:10,fill:'none',stroke:C.ink,'stroke-width':3}));
  });
  root.append(defs);
}
export function symbolUse(root,name,x,y,width,height){
  return add(root,svg('use',{href:'#sim-symbol-'+name,x,y,width,height}));
}
const metreX=metres=>trackPoint('main',metres).x;
function railLine(root,track,from=0,to=1000){
  const point=m=>trackPoint(track,m);
  const coords=[];
  for(let m=from;m<=to;m+=10)coords.push(point(m));
  if((to-from)%10)coords.push(point(to));
  const centre=coords.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  path(root,centre,'#b9ac91',21,{'stroke-linecap':'round','stroke-linejoin':'round'});
  for(let m=from;m<to;m+=26){
    const p=point(m);
    const sleeper=svg('g',{transform:'translate('+p.x+' '+p.y+') rotate('+p.angle+')'});
    line(sleeper,0,-14,0,14,'#6d655c',4);
    root.append(sleeper);
  }
  for(const offset of [-7,7]){
    const d=coords.map((p,i)=>{
      const theta=p.angle*Math.PI/180;
      const x=p.x-Math.sin(theta)*offset;
      const y=p.y+Math.cos(theta)*offset;
      return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
    }).join(' ');
    path(root,d,C.rail,4,{'stroke-linejoin':'round','stroke-linecap':'round'});
  }
}
function interactive(root,id,labelText,paint,active=false){
  const g=svg('g',{'data-sim-component':id,role:'button',tabindex:0,
    'aria-label':labelText,class:'sim-interactive'+(active?' sim-active':'')});
  root.append(g);paint(g);return g;
}
const inkBadge=(root,x,y,title,value,tone='inactive',width=150)=>{
  const colors={valid:'#e0f1e3',blocked:'#f9dfd7',warning:'#fff0c4',info:'#ddecf8',inactive:'#edf0ec'};
  rect(root,x,y,width,43,colors[tone]||colors.inactive,4,{stroke:'#758492','stroke-width':1.1});
  label(root,x+7,y+15,title,'sim-svg-small');
  label(root,x+7,y+32,value,'sim-svg-value');
};
function sectionPaint(root,world,section,occupied){
  const first=trackPoint(section.track,section.from),last=trackPoint(section.track,section.to);
  const col=occupied?C.stop:C.valid;
  if(section.track==='diverge'){
    const linePath='M'+first.x+' '+first.y+' L'+last.x+' '+last.y;
    path(root,linePath,col,5,{opacity:.6});
  }else line(root,first.x,first.y,last.x,last.y,col,5,{opacity:.58});
  const x=first.x+(last.x-first.x)/2;
  inkBadge(root,x-65,section.track==='upper'?38:section.track==='main'?259:339,
    section.id,occupied?'OCCUPIED':'CLEAR',occupied?'blocked':'valid',125);
}
function balisePaint(root,world,bg){
  const p=trackPoint(bg.track,bg.metres);
  symbolUse(root,'balise',p.x-21,p.y-13,42,27);
  label(root,p.x,p.y+37,bg.id,'sim-svg-label','middle');
  if(world.balises[bg.id].count){
    rect(root,p.x-20,p.y-22,40,3,C.valid,1);
    label(root,p.x,p.y+49,'READ '+world.balises[bg.id].count,'sim-svg-small','middle');
  }
}
function trainPaint(root,train,world){
  const p=trackPoint(train.track,train.position);
  // Each train remains a vector symbol; advance through turnout with the
  // instantaneous track tangent rather than a straight-line teleport.
  const g=svg('g',{'data-sim-train':train.id,
    transform:'translate('+p.x+' '+p.y+') rotate('+p.angle+')'});
  const sprite=svg('g',train.direction<0?{transform:'scale(-1 1)'}:{});
  symbolUse(sprite,'train',-86,-45,85,48);
  g.append(sprite);
  const tag=svg('g',{transform:'translate(0 -55)'});
  rect(tag,-58,-17,116,18,'#fff9ed',3,{stroke:'#74828a','stroke-width':1});
  label(tag,0,-5,'TRAIN '+train.id+' · '+train.level,'sim-svg-small','middle');
  g.append(tag);
  if(train.id==='A'){
    // Local equipment is placed relative to the moving train front.
    // The BTM detection coordinate uses the same 32-metre offset as the model.
    const antenna=svg('g',{'data-sim-component':'BTM',role:'button',tabindex:0,
      'aria-label':'Balise antenna under train A',class:'sim-interactive'});
    rect(antenna,-39,-6,14,7,'#efc34a',1,{stroke:'#31465b','stroke-width':1});
    path(antenna,'M-32 1 Q-40 8 -32 15 M-32 1 Q-24 8 -32 15',C.radio,1.4);
    g.append(antenna);
    const odom=svg('g',{'data-sim-component':'ODOM',role:'button',tabindex:0,
      'aria-label':'Onboard speed sensor, train A',class:'sim-interactive'});
    add(odom,svg('circle',{cx:-71,cy:-4,r:5,fill:'#f1da88',stroke:C.ink,'stroke-width':1}));
    g.append(odom);
  }
  root.append(g);
}
function drawJunction(root,world,selected){
  const occ=occupancy(world),axes=svg('g',{class:'sim-track-layer'});
  root.append(axes);
  railLine(axes,'upper');
  railLine(axes,'main');
  railLine(axes,'diverge',410);
  // A real turnout/switch schematic is connected at P1; not a surveyed model.
  interactive(root,'P1','Point P1 '+world.point.position+' / '+(world.point.locked?'locked':'unlocked'),g=>{
    const p=trackPoint('main',410);
    add(g,svg('circle',{cx:p.x,cy:p.y,r:16,fill:'none',
      stroke:world.point.locked?C.valid:C.warning,'stroke-width':3}));
    const arm=trackPoint('diverge',460);
    path(g,'M'+p.x+' '+p.y+' L'+arm.x+' '+arm.y,
      world.point.position==='reverse'?C.valid:C.inactive,4);
    inkBadge(g,p.x-30,248,'P1',world.point.position.toUpperCase(),world.point.locked?'valid':'warning',115);
  },selected==='P1');
  for(const section of TRACK_WORLD.sections)interactive(root,section.id,section.label+' track '+(occ[section.id].length?'occupied':'clear'),g=>
    sectionPaint(g,world,section,Boolean(occ[section.id].length)),selected===section.id);
  for(const bg of TRACK_WORLD.balises)interactive(root,bg.id,bg.id+' passage count '+world.balises[bg.id].count,
    g=>balisePaint(g,world,bg),selected===bg.id);
  for(const [i,sig] of TRACK_WORLD.signals.entries())interactive(root,sig.id,'Lineside '+sig.id,g=>{
    const p=trackPoint(sig.track,sig.metres);
    symbolUse(g,'signal',p.x-26,p.y-88,52,57);
    const proceed=sig.id==='S1'&&world.route.locked;
    add(g,svg('circle',{cx:p.x,cy:p.y-73,r:4,fill:proceed?C.valid:C.stop}));
    label(g,p.x,p.y-90,sig.id+' (schematic)','sim-svg-small','middle');
  },selected===sig.id);
  // Mark the L0-L2 study location, without treating this as a real order.
  interactive(root,'boundary','Illustrative level boundary',g=>{
    const x=metreX(TRACK_WORLD.levelBoundary.metres);
    line(g,x,70,x,341,C.radio,2,{'stroke-dasharray':'6 5'});
    label(g,x-12,75,'L0','sim-svg-label','end');
    label(g,x+12,75,'L2','sim-svg-label');
    label(g,x,90,'illustrative','sim-svg-small','middle');
  },selected==='boundary');
  if(world.route.locked){
    const start=trackPoint('diverge',410),end=trackPoint('diverge',850);
    const d='M'+start.x+' '+start.y+' L'+trackPoint('diverge',520).x+' 300 L'+end.x+' 300';
    path(root,d,C.valid,9,{opacity:.55,'stroke-linejoin':'round'});
  }
  for(const train of world.trains)interactive(root,'train-'+train.id,
    'Train '+train.id+' '+train.position+' metres',g=>trainPaint(g,train,world),selected==='train-'+train.id);
}
export function renderRailWorld(world,selected=''){
  const root=svg('svg',{class:'sim-world-svg',viewBox:TRACK_WORLD.viewBox.join(' '),
    role:'group','aria-label':'Railway junction simulator: selected components expose current sensor and system readings'});
  installRailSymbols(root);
  rect(root,0,0,1100,400,'#fffaf0',7);
  label(root,26,24,'ILLUSTRATIVE YARD JUNCTION  •  DISTANCES IN SIMULATED METRES','sim-svg-small');
  drawJunction(root,world,selected);
  interactive(root,'IXL','Interlocking state '+world.route.status,g=>{
    symbolUse(g,'ixl',380,32,104,54);
    inkBadge(g,470,31,'IXL / ROUTE',world.route.status,
      world.route.locked?'valid':world.route.status==='withheld'?'blocked':'warning',184);
  },selected==='IXL');
  interactive(root,'RBC','Radio Block Centre: '+world.rbc.exchange,g=>{
    symbolUse(g,'rbc',965,28,100,55);
    inkBadge(g,880,86,'RBC / POSITION',world.rbc.report?world.rbc.report.front+' m':'AWAIT REPORT',
      world.rbc.report?'info':'warning',190);
  },selected==='RBC');
  interactive(root,'radio','Radio bearer, not geolocation',g=>{
    symbolUse(g,'radio',803,14,66,63);
    path(g,'M828 82 Q650 -3 521 60',world.rbc.report?C.radio:C.inactive,2,
      {'stroke-dasharray':'7 5'});
    label(g,831,79,'RADIO','sim-svg-small','middle');
  },selected==='radio');
  interactive(root,'DMI','Driver display sample data',g=>{
    inkBadge(g,40,34,'DMI / TRAIN A',world.trains[0].speed+' km/h · '+world.trains[0].level,'info',205);
  },selected==='DMI');
  // An explicit authority marker: remains unissued until a separate fixture
  // event. The RBC server icon is not a radio tower measuring train position.
  if(world.ma.end!==null){
    const x=metreX(world.ma.end);
    line(root,x,191,x,326,C.stop,3,{'stroke-dasharray':'5 4'});
    label(root,x-8,333,'EOA (fixture)','sim-svg-small','end');
  }
  label(root,1059,389,'VIEW: VECTOR / NOT TO SCALE / NOT CERTIFIED','sim-svg-small','end');
  return root;
}
/**
 * Refresh only changing SVG detectors; keep train transforms alive so that the
 * full-size SVG never redraws on every animation frame.
 */
export function refreshRailDetectors(host,world,selected=''){
  const root=host.querySelector('.sim-world-svg');
  if(!root)return;
  const occupied=occupancy(world);
  const replace=id=>root.querySelector('[data-sim-component="'+id+'"]');
  for(const section of TRACK_WORLD.sections){
    const old=replace(section.id);if(!old)continue;
    const wrapper=svg('g');
    const next=interactive(wrapper,section.id,section.label+' track '+
      (occupied[section.id].length?'occupied':'clear'),g=>
      sectionPaint(g,world,section,Boolean(occupied[section.id].length)),selected===section.id);
    old.replaceWith(next);
  }
  for(const bg of TRACK_WORLD.balises){
    const old=replace(bg.id);if(!old)continue;
    const wrapper=svg('g');
    const next=interactive(wrapper,bg.id,bg.id+' passage count '+world.balises[bg.id].count,
      g=>balisePaint(g,world,bg),selected===bg.id);
    old.replaceWith(next);
  }
  const dmi=root.querySelector('[data-sim-component="DMI"] .sim-svg-value');
  if(dmi)dmi.textContent=world.trains[0].speed+' km/h · '+world.trains[0].level;
  const btm=root.querySelector('[data-sim-component="BTM"]');
  if(btm)btm.setAttribute('aria-label','Balise antenna under train A; last BG '+
    (world.trains[0].lrbg||'not acquired'));
}
export function animateRailWorld(host,before,after,duration=1100,onProgress=()=>{}){
  const changed=after.trains.filter(t=>{
    const prior=before.trains.find(p=>p.id===t.id);
    return prior&&(prior.position!==t.position||prior.track!==t.track);
  });
  if(!changed.length||typeof requestAnimationFrame!=='function'||
      (typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)){
    onProgress(1);
    return {promise:Promise.resolve(true),cancel(){}};
  }
  let frame=0,done=false,resolvePromise;
  const promise=new Promise(resolve=>{resolvePromise=resolve;});
  const start=typeof performance!=='undefined'?performance.now():Date.now();
  const finish=completed=>{
    if(done)return;
    done=true;if(frame)cancelAnimationFrame(frame);
    resolvePromise(completed);
  };
  const paint=fraction=>{
    for(const target of changed){
      const previous=before.trains.find(t=>t.id===target.id);
      const group=host.querySelector('[data-sim-train="'+target.id+'"]');
      if(!group)continue;
      const metres=previous.position+(target.position-previous.position)*fraction;
      const p=trackPoint(target.track,metres);
      group.setAttribute('transform','translate('+p.x+' '+p.y+') rotate('+p.angle+')');
    }
  };
  // Before movement begins, explicitly paint the origin frame.
  paint(0);
  onProgress(0);
  const tick=now=>{
    if(done)return;
    const elapsed=Math.min(1,Math.max(0,(now-start)/duration));
    const fraction=elapsed<.5?2*elapsed*elapsed:1-2*(1-elapsed)*(1-elapsed);
    paint(fraction);
    onProgress(fraction);
    if(elapsed>=1){finish(true);return;}
    frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return {promise,cancel:()=>finish(false)};
}
