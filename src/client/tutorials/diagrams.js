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
    const active=phase.includes('RUNNING')?['obu','dmi'].includes(node.id):
      phase.includes('GRANTED')||phase.includes('LOCKED')?['rbc','ixl'].includes(node.id):
      phase.includes('REVIEW')||phase.includes('DENIED')?['ixl','track','rbc'].includes(node.id):
      phase.includes('REPORT')||phase==='CONNECTED'?['obu','rbc'].includes(node.id):false;
    rectNode(svg,node.x,node.y,146,49,node.text,node.tag,active,phase.includes('REVIEW')?'red':'green');
  }
  return svg;
}
export function stateDiagram(lesson,phase){
  const svg=rootSvg('0 0 430 264',`Lesson state path for ${lesson.short}; active ${phase}`);
  defs(svg);
  const nodes=lesson.diagrams.stages;
  const positions=nodes.map((n,index)=>({x:index<3?20:224,y:index<3?20+index*80:60+(index-3)*100}));
  for(let index=0;index<2;index++)arrow(svg,positions[index].x+89,positions[index].y+49,positions[index+1].x+89,positions[index+1].y-4);
  for(const idx of [3,4])arrow(svg,positions[2].x+182,positions[2].y+24,positions[idx].x-3,positions[idx].y+24,true);
  nodes.forEach((n,index)=>{
    let {x,y}=positions[index];
    rectNode(svg,x,y,180,49,n.replaceAll('_',' '),index===0?'initial':index===1?'state transition':index===2?'normal movement':'fault / stop',n===phase,
      /REVIEW|STOP|DENIED|HELD|LOST/.test(n)?'red':'green');
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