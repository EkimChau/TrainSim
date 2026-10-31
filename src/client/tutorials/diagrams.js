/* Local SVG renderers for the versioned Mermaid source in lessons.js.
 * The source is shown verbatim in <details>; no CDN/remote render dependency.
 * All node positions are illustrative; animated highlights use the same state
 * projection as the reader and outputs. */
const NS='http://www.w3.org/2000/svg';
const ink='#252e3b';
function svgEl(tag,attrs={},text){
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=text;
  return node;
}
function rootSvg(viewBox,label){return svgEl('svg',{viewBox,role:'img','aria-label':label,class:'paper-diagram-svg'});}
function rectNode(svg,x,y,w,h,title,subtitle,active,tone='blue'){
  const group=svgEl('g',{class:`paper-graph-node${active?' paper-graph-active paper-graph-'+tone:''}`});
  group.append(svgEl('rect',{x,y,width:w,height:h,rx:8,fill:'#fdf9ed',stroke:ink,'stroke-width':2.2}));
  group.append(svgEl('text',{x:x+w/2,y:y+23,'text-anchor':'middle',class:'paper-svg-label'},title));
  if(subtitle)group.append(svgEl('text',{x:x+w/2,y:y+39,'text-anchor':'middle',class:'paper-svg-detail'},subtitle));
  svg.append(group);
}
function arrow(svg,x1,y1,x2,y2,dashed=false){
  svg.append(svgEl('path',{d:`M${x1} ${y1} L${x2} ${y2}`,
    fill:'none',stroke:ink,'stroke-width':2,'stroke-dasharray':dashed?'5 5':'none',
    'marker-end':'url(#paper-arrow)'}));
}
function defs(svg){
  const block=svgEl('defs');
  const marker=svgEl('marker',{id:'paper-arrow',viewBox:'0 0 10 10',refX:9,refY:5,
    markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
  marker.append(svgEl('path',{d:'M0 0 L10 5 L0 10 z',fill:ink}));block.append(marker);svg.append(block);
}
export function flowDiagram(lesson,phase){
  const svg=rootSvg('0 0 720 202',`System flow for ${lesson.short}; state ${phase}`);
  defs(svg);
  const byId=new Map(lesson.diagrams.actors.map(n=>[n.id,n]));
  for(const [from,to] of lesson.diagrams.arrows){
    const a=byId.get(from),b=byId.get(to);if(!a||!b)continue;
    const middleA=a.x+146,middleB=b.x;
    const ay=a.y+24,by=b.y+24;
    if(middleA<=middleB)arrow(svg,middleA,ay,middleB-3,by);
    else arrow(svg,a.x+73,a.y+49,b.x+73,b.y-3);
  }
  for(const node of lesson.diagrams.actors){
    const active=lesson.authoredRule ? (['ACTIVE','PROGRESS','COMPLETE'].includes(phase)?node.id===lesson.diagrams.actors.at(-1)?.id:['REVIEW','BLOCKED'].includes(phase)?node.id===lesson.diagrams.actors.at(-2)?.id:false) : phase.includes('RUNNING')?['obu','dmi'].includes(node.id):
      phase.includes('GRANTED')||phase.includes('LOCKED')?['rbc','ixl'].includes(node.id):
      phase.includes('REVIEW')||phase.includes('DENIED')?['ixl','track','rbc'].includes(node.id):
      phase.includes('REPORT')||phase==='CONNECTED'?['obu','rbc'].includes(node.id):false;
    rectNode(svg,node.x,node.y,146,49,node.text,node.tag,active,/REVIEW|BLOCKED/.test(phase)?'red':'green');
  }
  return svg;
}
export function stateDiagram(lesson,phase){
  const nodes=lesson.diagrams.stages;
  const rows=Math.ceil(nodes.length/2);
  const height=Math.max(265,rows*65+38);
  const svg=rootSvg(`0 0 442 ${height}`,`Lesson state path for ${lesson.short}; active ${phase}`);
  defs(svg);
  const pos=new Map(nodes.map((name,index)=>[name,{
    x:index<rows?17:242,
    y:18+(index%rows)*65,
    col:index<rows?0:1,
  }]));
  // An arrow is drawn from each Mermaid transition, so the source list and graph
  // share the same declared transitions instead of maintaining two edge registries.
  const re=/^\s*([A-Z][A-Z_0-9]*)\s*-->\s*([A-Z][A-Z_0-9]*)/;
  for(const line of lesson.diagrams.state.split('\n')){
    const match=line.match(re);if(!match)continue;
    const a=pos.get(match[1]),b=pos.get(match[2]);if(!a||!b)continue;
    if(a.col===b.col){
      const down=b.y>a.y;
      arrow(svg,a.x+(down?87:165),a.y+(down?48:0),b.x+(down?87:165),b.y+(down?0:48),!down);
    }else{
      arrow(svg,a.x+173,a.y+25,b.x-4,b.y+25,true);
    }
  }
  nodes.forEach(name=>{
    const {x,y}=pos.get(name);
    const caution=/REVIEW|STOP|DENIED|HELD|LOST|WITHHELD|BLOCKED/.test(name);
    rectNode(svg,x,y,174,47,name.replaceAll('_',' '),name===phase?'active now':'',name===phase,caution?'red':'green');
  });
  return svg;
}
export function speedLine(line,pulse=false){
  if(!line)return null;
  const svg=rootSvg('0 0 720 80','Illustrative running line: train front and authority boundary');
  const start=30,end=690;
  const portion=Math.max(0,Math.min(1,(line.position-line.start)/Math.max(1,line.end-line.start)));
  const x=start+(end-start)*portion;
  svg.append(svgEl('line',{x1:start,y1:43,x2:end,y2:43,stroke:ink,'stroke-width':7,'stroke-linecap':'round'}));
  for(let xx=start+20;xx<end;xx+=25)svg.append(svgEl('line',{x1:xx,y1:33,x2:xx,y2:53,stroke:'#6d6556','stroke-width':2}));
  svg.append(svgEl('line',{x1:start,y1:43,x2:Math.max(start,x),y2:43,stroke:'#439357','stroke-width':6,
    class:pulse?'paper-speed-streak':''}));
  svg.append(svgEl('circle',{cx:x,cy:43,r:11,fill:'#cde8d0',stroke:ink,'stroke-width':2}));
  svg.append(svgEl('text',{x,y:19,'text-anchor':'middle',class:'paper-svg-label'},'TRAIN'));
  svg.append(svgEl('path',{d:`M${end} 23 V61`,stroke:'#c34a43','stroke-width':3,fill:'none'}));
  svg.append(svgEl('text',{x:end,y:15,'text-anchor':'end',class:'paper-svg-detail'},`${line.end} m`));
  svg.append(svgEl('text',{x:25,y:73,class:'paper-svg-detail'},`${line.position} m front • permitted ${line.speed} km/h`));
  return svg;
}

/**
 * Responsive learning re-expressions of indexed SRS figures.
 * Deliberately NOT a redraw of the standard's engineering figure. A legend
 * exposes source figure ID and original caption; the visual is a family-scale
 * functional illustration driven by synthetic lesson measurements.
 */
export function figureDiagram(figure,snapshot){
  const title=`SUBSET-026-${figure.chapter} Figure ${figure.figure}: ${figure.caption}`;
  const svg=rootSvg('0 0 720 232',`Educational re-expression of ${title}; ${snapshot.phase}`);
  defs(svg);
  const words=figure.caption.toLowerCase();
  const warning=/BLOCKED|REVIEW|STOP|DENIED|FAILED|LOST/.test(snapshot.phase);
  const accent=warning?'#bd4c4b':'#438e61';
  const heading=(text,y=23)=>svg.append(svgEl('text',{x:18,y,class:'paper-svg-label'},text));
  const detail=(text,y)=>svg.append(svgEl('text',{x:18,y,class:'paper-svg-detail'},text));
  heading(`Figure ${figure.figure} · ${(figure.caption.length>84?figure.caption.slice(0,81)+'…':figure.caption)}`);
  if(/speed|curve|brak|gradient|profile|deceleration|traction|supervision|kv_int/i.test(words)){
    arrow(svg,72,185,662,185);
    arrow(svg,72,185,72,42);
    svg.append(svgEl('path',{d:'M72 64 C168 76 221 92 299 120 S468 164 651 178',fill:'none',stroke:accent,'stroke-width':4,'stroke-dasharray':'0'}));
    svg.append(svgEl('path',{d:'M72 104 C190 114 305 132 400 146 S540 177 651 183',fill:'none',stroke:'#507faf','stroke-width':3,'stroke-dasharray':'7 4'}));
    svg.append(svgEl('line',{x1:310,y1:55,x2:310,y2:185,stroke:'#bda75e','stroke-width':3,'stroke-dasharray':'5 5'}));
    svg.append(svgEl('circle',{cx:310,cy:121,r:9,fill:'#fff3b2',stroke:ink,'stroke-width':2}));
    detail('Illustrative signal limits and target position · not an ETCS braking curve',214);
  }else if(/balise|position|orientation|co-ordinate|location|linking|route|infill|lx|level crossing|track/i.test(words)){
    svg.append(svgEl('line',{x1:40,y1:120,x2:682,y2:120,stroke:ink,'stroke-width':7}));
    svg.append(svgEl('line',{x1:40,y1:151,x2:682,y2:151,stroke:ink,'stroke-width':7}));
    for(let x=53;x<682;x+=35)svg.append(svgEl('line',{x1:x,y1:117,x2:x+15,y2:154,stroke:'#806e57','stroke-width':3}));
    for(const x of [170,335,525]){
      svg.append(svgEl('rect',{x,y:113,width:19,height:45,rx:3,fill:'#dfeafb',stroke:ink,'stroke-width':2}));
      svg.append(svgEl('text',{x:x+9,y:102,'text-anchor':'middle',class:'paper-svg-detail'},`BG${[170,335,525].indexOf(x)+1}`));
    }
    const position=snapshot.speedline?.position??300;
    const end=snapshot.speedline?.end??1000;
    const x=55+Math.max(0,Math.min(1,position/Math.max(1,end)))*587;
    svg.append(svgEl('rect',{x:x-22,y:74,width:44,height:34,rx:7,fill:'#d1e7d7',stroke:ink,'stroke-width':3}));
    svg.append(svgEl('path',{d:`M${x-11} 110 v9 m22 -9 v9`,stroke:accent,'stroke-width':4}));
    detail('Synthetic geometry · route/position labels are not surveyed infrastructure',215);
  }else if(/message|packet|data|information|structure|radio|version/i.test(words)){
    const labels=['Header','Condition','Payload','Receiver'];
    for(let j=0;j<labels.length;j++){
      const x=30+j*174;
      rectNode(svg,x,75,146,70,labels[j],j===3?snapshot.phase:'value / status',j===3,!warning?'green':'red');
      if(j<3)arrow(svg,x+148,108,x+169,108);
    }
    detail('Illustrative input validation and packet/message forwarding; not bit-accurate',215);
  }else{
    const phases=['Input condition','Decision','Output','Next event'];
    for(let j=0;j<phases.length;j++){
      const x=22+j*175;
      rectNode(svg,x,84,147,65,phases[j],j===2?snapshot.phase:'teaching state',j===2,warning?'red':'green');
      if(j<3)arrow(svg,x+148,116,x+171,116);
    }
    detail('Simplified state/condition flow, source diagram not reproduced to scale',215);
  }
  return svg;
}
