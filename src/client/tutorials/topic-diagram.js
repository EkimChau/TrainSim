/**
 * TrainSim railway scene renderer.
 * Draws from the scene/data contract in topics.js, not from a screenshot.
 * The stable layout is deliberately schematic and never a signalling display.
 */
const NS='http://www.w3.org/2000/svg';
const COLORS={ink:'#26374d',track:'#64748b',blue:'#2168a9',green:'#20845e',red:'#bd4d43',paper:'#fffaf0',pale:'#dae9f9'};
const X0=52,X1=1007;
export const sceneX=(metres,max=1100)=>X0+(X1-X0)*Math.max(0,Math.min(1,metres/Math.max(max,1)));
const s=(tag,attributes={},label)=>{
  const element=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attributes))if(value!==null&&value!==undefined)element.setAttribute(key,String(value));
  if(label!==undefined)element.textContent=String(label);
  return element;
};
const add=(parent,...children)=>{parent.append(...children);return parent;};
const txt=(parent,x,y,value,cls='topic-svg-label',anchor='start')=>
  add(parent,s('text',{x,y,class:cls,'text-anchor':anchor},value));
const path=(parent,d,stroke=COLORS.ink,width=2,more={})=>
  add(parent,s('path',{d,stroke,'stroke-width':width,fill:'none',...more}));
const line=(parent,x1,y1,x2,y2,stroke=COLORS.ink,width=2,more={})=>
  add(parent,s('line',{x1,y1,x2,y2,stroke,'stroke-width':width,...more}));
const block=(parent,x,y,w,h,fill,rx=5)=>
  add(parent,s('rect',{x,y,width:w,height:h,fill,rx,stroke:COLORS.ink,'stroke-width':2}));
function part(root,id,scene,selected,tag){
  const active=scene.parts.includes(id),selectedNow=id===selected;
  const live=scene.highlightedParts?.includes(id);
  const g=s('g',{'data-component':id,role:'button',tabindex:0,
    'aria-label':tag||id,class:'topic-svg-part'+(active?' topic-svg-relevant':' topic-svg-context')+
      (selectedNow?' topic-svg-selected':'')+(live?' topic-svg-live':'')});
  root.append(g);return g;
}

export function railwayDiagram(scene,selected=''){
  const svg=s('svg',{class:'topic-scene-svg',viewBox:'0 0 1060 390',
    role:'group','aria-label':'Interactive schematic railway: click a part to explore its definition'});
  add(svg,s('rect',{x:0,y:0,width:1060,height:390,fill:'#fffaf0',rx:10}));
  add(svg,s('rect',{x:23,y:15,width:1014,height:307,fill:'#f7f5ec',rx:9}));
  const worldMax=scene.layout.max;
  const px=m=>sceneX(m,worldMax);
  const fx=px(scene.front);
  txt(svg,45,37,'TRAIN & TRACKSIDE • NOT TO SCALE','topic-svg-muted');
  txt(svg,1010,37,'Direction of travel →','topic-svg-muted','end');
  // Track anchor stays on screen throughout every topic.
  const rails=part(svg,'track',scene,selected,'Track and sleepers');
  for(let i=68;i<1010;i+=29)line(rails,i,264,i+14,310,'#9b8b74',5);
  line(rails,42,273,1015,273,COLORS.track,7);
  line(rails,42,302,1015,302,COLORS.track,7);
  txt(rails,48,329,'TRACK A','topic-svg-muted');
  // Fixed trackside assets are independent of lesson, so the learner sees
  // familiar positions in later topics.
  const pxSignal=px(scene.layout.signalMetres);
  const signal=part(svg,'signal',scene,selected,'Lineside signal');
  line(signal,pxSignal,178,pxSignal,265,COLORS.ink,5);
  block(signal,pxSignal-14,177,28,57,'#edf3fa',5);
  add(signal,s('circle',{cx:pxSignal,cy:190,r:6,fill:scene.warning?COLORS.red:COLORS.green}));
  add(signal,s('circle',{cx:pxSignal,cy:211,r:6,fill:'#e7c46a'}));
  txt(signal,pxSignal,165,'SIGNAL','topic-svg-tiny','middle');
  const point=part(svg,'point',scene,selected,'Track point or switch');
  const pxPoint=px(scene.layout.pointMetres);
  path(point,'M'+(pxPoint-60)+' 300 L'+(pxPoint+46)+' 252',COLORS.track,6);
  line(point,pxPoint-22,290,pxPoint+37,290,COLORS.ink,3);
  add(point,s('circle',{cx:pxPoint-20,cy:291,r:5,fill:COLORS.blue}));
  txt(point,pxPoint+12,248,'POINT','topic-svg-tiny','middle');
  // Repeated balise-group instances share one component definition, but have
  // independent metre coordinates from the scene source.
  for(const bg of scene.layout.baliseGroups){
    const bx=px(bg.metres),passed=Math.abs(bg.metres-scene.front)<=35;
    const group=part(svg,'balise',scene,selected,bg.id+' at '+bg.metres+' metres');
    if(passed)group.classList.add('topic-balise-passing');
    add(group,s('rect',{x:bx-12,y:276,width:24,height:21,rx:3,fill:passed?'#f3c86b':'#80c4cf',
      stroke:COLORS.ink,'stroke-width':2}));
    line(group,bx-6,281,bx+6,293,'#30657b',2);
    txt(group,bx,345,bg.id,'topic-svg-tiny','middle');
    txt(group,bx,358,bg.metres+' m','topic-svg-muted','middle');
  }
  if(scene.lrbg){
    const lx=px(scene.lrbg.metres);
    const lrbg=part(svg,'lrbg',scene,selected,'LRBG '+scene.lrbg.id);
    path(lrbg,'M'+lx+' 267 L'+lx+' 247',COLORS.blue,2,{'stroke-dasharray':'4 3'});
    add(lrbg,s('path',{d:'M'+lx+' 236 l-7 7 7 7 7-7 z',fill:'#f7d573',stroke:COLORS.ink,'stroke-width':1.5}));
    txt(lrbg,lx,230,'LRBG','topic-svg-tiny','middle');
  }
  // Confidence interval is projected from the existing authored evaluator,
  // rather than redoing the safety-front calculation in the visual renderer.
  if(scene.confidence){
    const band=part(svg,'lrbg',scene,selected,'Safe-front interval computed by the lesson');
    const left=px(scene.confidence.min),right=px(scene.confidence.max);
    line(band,left,139,right,139,COLORS.blue,10,{opacity:.4});
    line(band,left,131,left,147,COLORS.blue,2);
    line(band,right,131,right,147,COLORS.blue,2);
    txt(band,(left+right)/2,124,'SAFE FRONT '+scene.confidence.min+'–'+scene.confidence.max+' m','topic-svg-tiny','middle');
  }
  // Interlocking and RBC are separate boxes; radio is a bearer rather than a
  // physical RBC located inside the mast.
  const ixl=part(svg,'ixl',scene,selected,'External interlocking');
  block(ixl,795,130,116,62,'#e5e9d8');
  txt(ixl,853,154,'IXL','topic-svg-label','middle');
  txt(ixl,853,175,'route control','topic-svg-tiny','middle');
  path(ixl,'M853 193 L853 242',COLORS.ink,2,{'stroke-dasharray':'5 5'});
  const rbc=part(svg,'rbc',scene,selected,'Radio Block Centre');
  block(rbc,796,53,115,59,'#d7e8f6');
  txt(rbc,853,78,'RBC','topic-svg-label','middle');
  txt(rbc,853,98,'trackside ETCS','topic-svg-tiny','middle');
  path(rbc,'M853 113 L853 129',COLORS.ink,2,{'stroke-dasharray':'4 4'});
  const radio=part(svg,'radio',scene,selected,'Illustrative radio mast and bearer');
  line(radio,969,80,969,241,COLORS.ink,4);
  path(radio,'M950 241 L969 91 L988 241',COLORS.ink,2.5);
  for(const yy of [147,185,219])line(radio,953,yy,985,yy,COLORS.ink,1.3);
  add(radio,s('circle',{cx:969,cy:75,r:6,fill:scene.radioAvailable===false?COLORS.red:COLORS.green}));
  path(radio,'M949 61 Q969 37 989 61 M940 56 Q969 22 999 56',scene.radioAvailable===false?COLORS.red:COLORS.blue,2.2);
  txt(radio,977,265,'RADIO','topic-svg-tiny','middle');
  // Travel/position is a projection of the same lesson state as the dashboard.
  const train=part(svg,'train',scene,selected,'Train front '+scene.front+' m');
  train.setAttribute('data-train-animated','true');
  const rear=px(Math.max(0,scene.trainRear));
  const bodyX=Math.max(41,Math.min(rear,fx-80));
  const bodyW=Math.max(75,fx-bodyX);
  block(train,bodyX,189,bodyW,68,'#dcefe8',10);
  add(train,s('path',{d:'M'+(fx-35)+' 190 L'+(fx-1)+' 206 L'+(fx-1)+' 248 L'+(fx-35)+' 257 Z',
    fill:'#8cc7c2',stroke:COLORS.ink,'stroke-width':2}));
  for(let xx=bodyX+23;xx<fx-45;xx+=36)block(train,xx,199,24,22,'#a5cce9',3);
  for(const wheel of [bodyX+26,fx-25])add(train,s('circle',{cx:wheel,cy:263,r:10,fill:'#34475c',stroke:'#152334','stroke-width':2}));
  const cab=part(svg,'cab',scene,selected,'Driver cab at train front');
  block(cab,fx-32,199,22,22,'#7fb4dd',3);
  txt(cab,fx-20,184,'CAB','topic-svg-tiny','middle');
  const dmi=part(svg,'dmi',scene,selected,'Driver machine interface in cab');
  add(dmi,s('rect',{x:fx-26,y:225,width:15,height:13,rx:2,fill:'#253c52',stroke:'#fff','stroke-width':1}));
  const obu=part(svg,'obu',scene,selected,'ETCS onboard unit');
  add(obu,s('rect',{x:bodyX+30,y:238,width:32,height:12,rx:2,fill:'#c0ac6e',stroke:COLORS.ink,'stroke-width':1}));
  const antenna=part(svg,'antenna',scene,selected,'Balise antenna beneath train');
  const ax=fx-42;
  block(antenna,ax-13,264,26,7,'#f5d476',2);
  path(antenna,'M'+ax+' 274 Q'+(ax+12)+' 285 '+ax+' 296 M'+ax+' 274 Q'+(ax-12)+' 285 '+ax+' 296',COLORS.blue,1.7);
  // Leading front and displayed rear positions, never a location claim.
  line(svg,fx,178,fx,271,COLORS.blue,1.5,{'stroke-dasharray':'4 3'});
  txt(svg,fx,168,'FRONT '+(scene.frontProvided?scene.front+' m':'example'),'topic-svg-tiny','middle');
  txt(svg,bodyX,168,'REAR','topic-svg-tiny','middle');
  // Radio link projection is explicitly conditional on available input.
  const link=part(svg,'radio',scene,selected,'Radio network communication path');
  path(link,'M'+(fx-18)+' 185 Q'+((fx+960)/2)+' 31 969 100',scene.radioAvailable===false?COLORS.red:COLORS.blue,
    2,{'stroke-dasharray':'7 6',opacity:0.65});
  // Authority is drawn separately from a lineside signal indication.
  if(scene.authorityVisible){
    const start=px(scene.front),end=px(scene.maEnd);
    const ma=part(svg,'ma',scene,selected,'Displayed movement authority interval');
    line(ma,start,368,end,368,scene.authorityIssued?COLORS.green:COLORS.blue,7,
      {opacity:0.8,'stroke-dasharray':scene.authorityIssued?'none':'8 7'});
    txt(ma,(start+end)/2,382,'MA '+(scene.authorityIssued?'ISSUED':'PROPOSED'),'topic-svg-tiny','middle');
    const eoa=part(svg,'eoa',scene,selected,'End at '+scene.maEnd+' m: '+scene.maType);
    line(eoa,end,241,end,368,COLORS.red,3,{'stroke-dasharray':'5 3'});
    add(eoa,s('path',{d:'M'+end+' 233 l-8 9 16 0 z',fill:COLORS.red}));
    txt(eoa,end,227,scene.maType+' '+scene.maEnd+' m','topic-svg-tiny','middle');
  }
  // Existing screen anchors keep the concept visible as later topics add detail.
  const mode=part(svg,'mode',scene,selected,'ETCS level and mode');
  txt(mode,52,56,'MODE / LEVEL → CAB','topic-svg-muted');
  const speed=part(svg,'speed',scene,selected,'Speed limits and targets');
  txt(speed,52,74,'SPEED / TARGETS → CAB','topic-svg-muted');
  return svg;
}

export function animateTrainTravel(host,previousFront,nextFront,max){
  const group=host.querySelector('[data-train-animated]');
  if(!group||!Number.isFinite(previousFront)||previousFront===nextFront||typeof group.animate!=='function')return;
  if(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const dx=sceneX(previousFront,max)-sceneX(nextFront,max);
  group.animate([{transform:'translateX('+dx+'px)'},{transform:'translateX(0px)'}],
    {duration:620,easing:'ease-in-out',fill:'none'});
}
