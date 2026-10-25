// Local SVG renderer: a working zero-credential demo, not a geographical basemap.
const NS='http://www.w3.org/2000/svg';
const make=(name,attributes={})=>{const el=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attributes))el.setAttribute(k,String(v));return el;};
export class SvgAdaptor {
  constructor(container,world) {
    this.container=container;this.name='SVG demo canvas';
    const coords=[...world.tracks.flatMap(t=>t.coords),...world.stations];
    this.bounds={minLat:Math.min(...coords.map(p=>p.lat))-.008,maxLat:Math.max(...coords.map(p=>p.lat))+.008,minLng:Math.min(...coords.map(p=>p.lng))-.012,maxLng:Math.max(...coords.map(p=>p.lng))+.012};
    this.svg=make('svg',{viewBox:'0 0 1000 680',role:'img','aria-label':'Schematic Brisbane synthetic rail demo','preserveAspectRatio':'xMidYMid meet'});
    this.svg.classList.add('demo-svg');
    this.svg.append(make('rect',{width:1000,height:680,fill:'#101e2d'}));
    // Visual grid; no claim of map accuracy.
    for(let i=0;i<10;i++)this.svg.append(make('path',{d:`M ${i*120} 0 V 680 M 0 ${i*90} H 1000`,stroke:'#27384a','stroke-width':1}));
    const north=make('text',{x:950,y:46,fill:'#93aec4','font-size':16});north.textContent='N ↑';this.svg.append(north);
    container.replaceChildren(this.svg);
  }
  xy(pos) {const {minLat,maxLat,minLng,maxLng}=this.bounds;return {x:50+(pos.lng-minLng)/(maxLng-minLng)*900,y:40+(maxLat-pos.lat)/(maxLat-minLat)*600};}
  addTrack(track) {
    const el=make('polyline',{points:track.coords.map(c=>{const p=this.xy(c);return `${p.x},${p.y}`}).join(' '),fill:'none',stroke:'#fb6964','stroke-width':4,'stroke-linejoin':'round','stroke-linecap':'round'});
    this.svg.append(el);return this.control(el);
  }
  addPoint(kind,record) {
    const pos=record.position||record,point=this.xy(pos);
    const grp=make('g',{transform:`translate(${point.x} ${point.y})`});
    if(kind==='station'){
      grp.append(make('circle',{r:7,fill:'#77b4ff',stroke:'#ecf6ff','stroke-width':2}));
      const label=make('text',{x:11,y:-10,fill:'#bed4eb','font-size':12,'paint-order':'stroke',stroke:'#101e2d','stroke-width':4});label.textContent=record.name;grp.append(label);
    } else if(kind==='signal')grp.append(make('path',{d:'M 0 -9 L 9 8 L -9 8 Z',fill:'#52e1a3',stroke:'#0b2119','stroke-width':2}));
    else grp.append(make('path',{d:'M 0 -11 L 8 10 L 0 6 L -8 10 Z',fill:record.color||'#ffdb52',stroke:'#131722','stroke-width':2}));
    const title=make('title');title.textContent=record.name||record.id||kind;grp.append(title);this.svg.append(grp);
    return {...this.control(grp),setPosition:p=>{const pt=this.xy(p);grp.setAttribute('transform',`translate(${pt.x} ${pt.y})`);},setAlert:alert=>{if(kind==='train')grp.querySelector('path').setAttribute('fill',alert?'#ff4f60':record.color||'#ffdb52');}};
  }
  control(el) {return {setVisible:on=>el.style.display=on?'':'none',remove:()=>el.remove()};}
}
