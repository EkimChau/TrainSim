import {IconLayer,PathLayer,ScatterplotLayer,TextLayer,PolygonLayer} from '@deck.gl/layers';
import {PathStyleExtension} from '@deck.gl/extensions';
import {api,el,fmt,store,toast} from '../api.js';
import {createBasemap,rasterLayer,SEQ_VIEW} from './basemap.js';
import {STYLES,STATION_COLOUR,hex,legend,poiColour,signalColour,trackColour,trackDash,trackWidth,SIGNAL_LEGEND} from './styles.js';
import {Simulation} from './sim.js';
import {trainFormation} from '../../shared/formation.js';
import {trainIcon} from './train-icons.js';

const $=id=>document.getElementById(id);
const dash=new PathStyleExtension({dash:true});
const FONT='system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const ORM_TILES=style=>['a','b','c'].map(s=>`https://${s}.tiles.openrailwaymap.org/${style}/{z}/{x}/{y}.png`);

export class MapView{
  constructor({config,onOpenData}){
    this.config=config;this.onOpenData=onOpenData;
    const hashStyle=/[?&]style=(\w+)/.exec(location.hash)?.[1];
    this.style=STYLES.some(s=>s.id===hashStyle)?hashStyle:store.get('mapStyle','infrastructure');
    this.visible=store.get('mapLayers',{tracks:true,stations:true,scope:true,platforms:true,signals:true,switches:true,pois:true,orm:false});
    this.data={tracks:[],stations:[],scope:[],signals:[],switches:[],platforms:[],pois:[],zoom:10};
    this.selected=null;this.request=0;this.started=false;
    this.sim=new Simulation({onFrame:()=>this.render(),log:(m)=>this.simLog(m)});
  }

  async start(){
    if(this.started)return;this.started=true;
    this.controls();
    const initial=parseHashView()??SEQ_VIEW;
    this.map=await createBasemap($('map'),this.config,{
      initial,
      onView:v=>{this.viewport=v;this.load();this.writeHash(v);},
      onClick:info=>this.click(info),
      getTooltip:({object,layer})=>object&&tooltip(layer?.id,object),
    });
    $('basemap-field').hidden=this.map.kind!=='google';
    this.status=await api('/map/status').catch(()=>({available:false}));
    if(!this.status.available){
      const b=$('map-banner');b.hidden=false;
      b.replaceChildren('No world database yet. Run ',el('code',{},'npm run ingest'),' (or ',el('code',{},'python3 scripts/ingest_osm.py'),') to populate ',el('code',{},this.config.worldDb),'.');
    }else if(this.status.extent&&!parseHashView()){
      const {w,s,e,n}=this.status.extent;this.map.fit([w,s,e,n]);
    }
    if(this.map.kind!=='google')toast('No GOOGLE_MAPS_API_KEY set: showing OpenStreetMap tiles instead of Google Maps.');
    this.sim.loadRoutes();
    this.renderLegend();
    this.load();
  }

  controls(){
    const sel=$('map-style');
    for(const s of STYLES)sel.append(el('option',{value:s.id},s.label));
    sel.value=this.style;
    sel.addEventListener('change',()=>{this.style=sel.value;store.set('mapStyle',this.style);this.renderLegend();this.render();this.writeHash(this.viewport);});
    for(const box of document.querySelectorAll('[data-layer]')){
      box.checked=!!this.visible[box.dataset.layer];
      box.addEventListener('change',()=>{this.visible[box.dataset.layer]=box.checked;store.set('mapLayers',this.visible);this.render();});
    }
    $('basemap').addEventListener('change',e=>this.map?.setType(e.target.value));
    $('inspector-close').addEventListener('click',()=>{this.selected=null;$('inspector').hidden=true;this.render();});
    let timer;
    const input=$('map-search'),results=$('search-results');
    input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>this.search(input.value),220);});
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){results.hidden=true;input.blur();}});
    document.addEventListener('click',e=>{if(!e.target.closest('.search'))results.hidden=true;});
  }

  async search(q){
    const box=$('search-results');
    if(q.trim().length<2){box.hidden=true;return;}
    try{
      const {results}=await api('/map/search',{query:{q}});
      box.replaceChildren(...(results.length?results.map(r=>el('button',{type:'button',onclick:()=>{
        box.hidden=true;this.map.flyTo(r.lat,r.lon,16);
        if(r.type&&r.id!=null)this.inspect(r.type,r.id);
      }},el('span',{},r.name||'(no name)'),el('small',{},`${r.kind} · ${r.detail??''}`))):[el('div',{class:'muted',style:'padding:8px'},'No matches')]));
      box.hidden=false;
    }catch(e){toast(e.message,'error');}
  }

  async load(){
    if(!this.viewport||this.status?.available===false)return;
    const id=++this.request;
    try{
      const d=await api('/map/features',{query:{bbox:this.viewport.bbox.map(v=>v.toFixed(5)).join(','),zoom:this.viewport.zoom}});
      if(id!==this.request)return;
      this.data=d;this.render();
    }catch(e){if(id===this.request)toast(`Map data: ${e.message}`,'error');}
  }

  render(){
    if(!this.map)return;
    const v=this.visible,d=this.data,z=d.zoom??10,style=this.style;
    const ormStyle=STYLES.find(s=>s.id===style)?.orm??'standard';
    const layers=[];
    if(v.orm)layers.push(rasterLayer(`orm-${ormStyle}`,ORM_TILES(ormStyle),{opacity:0.9,maxZoom:19}));
    if(v.pois)layers.push(new PolygonLayer({id:'landuse',data:d.pois.filter(p=>p.kind==='landuse'&&p.coords?.length>2),
      getPolygon:p=>p.coords,filled:true,stroked:false,getFillColor:[255,129,0,26],pickable:false}));
    if(v.platforms)layers.push(
      new PathLayer({id:'platforms',data:d.platforms.filter(p=>p.coords?.length>1),getPath:p=>p.coords,getColor:[120,120,120,230],
        getWidth:z>=16?5:3,widthUnits:'pixels',capRounded:true,jointRounded:true,pickable:true}),
      new ScatterplotLayer({id:'platform-nodes',data:d.platforms.filter(p=>!p.coords),getPosition:p=>[p.lon,p.lat],getRadius:4,radiusUnits:'pixels',
        getFillColor:[120,120,120],pickable:true}));
    if(v.tracks){
      layers.push(new PathLayer({id:'tracks',data:d.tracks,getPath:t=>t.coords,
        getColor:t=>trackColour(t,style),getWidth:t=>trackWidth(t,z),widthUnits:'pixels',widthMinPixels:1,
        capRounded:true,jointRounded:true,getDashArray:t=>trackDash(t),dashJustified:true,extensions:[dash],
        pickable:true,autoHighlight:true,highlightColor:[255,255,0,180],
        updateTriggers:{getColor:style,getWidth:z}}));
    }
    if(this.sim.path)layers.push(new PathLayer({id:'sim-route',data:[{path:this.sim.path}],getPath:x=>x.path,getColor:[255,212,0,170],getWidth:9,widthUnits:'pixels',capRounded:true,jointRounded:true}));
    if(v.pois)layers.push(new ScatterplotLayer({id:'pois',data:d.pois.filter(p=>p.kind!=='landuse'),getPosition:p=>[p.lon,p.lat],
      getRadius:p=>p.kind==='milestone'?3:4,radiusUnits:'pixels',getFillColor:p=>poiColour(p),stroked:true,getLineColor:[255,255,255],lineWidthUnits:'pixels',getLineWidth:1,pickable:true}));
    if(v.switches)layers.push(new ScatterplotLayer({id:'switches',data:d.switches,getPosition:s=>[s.lon,s.lat],getRadius:z>=16?4:3,radiusUnits:'pixels',
      getFillColor:[40,40,40],stroked:true,getLineColor:[255,255,255],lineWidthUnits:'pixels',getLineWidth:1,pickable:true}));
    if(v.signals)layers.push(new ScatterplotLayer({id:'signals',data:d.signals,getPosition:s=>[s.lon,s.lat],getRadius:z>=16?5:3.5,radiusUnits:'pixels',
      getFillColor:s=>signalColour(s),stroked:true,getLineColor:[20,20,20],lineWidthUnits:'pixels',getLineWidth:1,pickable:true}));
    if(v.scope)layers.push(new ScatterplotLayer({id:'scope',data:d.scope.filter(s=>s.lat!=null),getPosition:s=>[s.lon,s.lat],
      getRadius:z>=13?11:8,radiusUnits:'pixels',filled:false,stroked:true,lineWidthUnits:'pixels',getLineWidth:3,
      getLineColor:s=>s.colour?[...hex(s.colour),230]:[0,0,0,200],pickable:true}));
    if(v.stations){
      layers.push(new ScatterplotLayer({id:'stations',data:d.stations,getPosition:s=>[s.lon,s.lat],
        getRadius:s=>s.kind==='station'?(z>=13?6:4.5):3.5,radiusUnits:'pixels',getFillColor:[255,255,255],stroked:true,
        getLineColor:s=>hex(STATION_COLOUR[s.kind]??'#555555'),lineWidthUnits:'pixels',getLineWidth:2.5,pickable:true}));
    }
    const labels=[];
    if(v.stations&&z>=12)labels.push(...d.stations.filter(s=>s.name&&(z>=14||s.kind==='station'||s.kind==='halt')).map(s=>({text:s.name,lon:s.lon,lat:s.lat,size:12})));
    else if(v.scope&&z<12)labels.push(...d.scope.filter(s=>s.lat!=null&&(z>=10||s.status==='matched')).map(s=>({text:s.name,lon:s.lon,lat:s.lat,size:11})));
    if(v.signals&&z>=16)labels.push(...d.signals.filter(s=>s.ref).map(s=>({text:s.ref,lon:s.lon,lat:s.lat,size:10,small:true})));
    if(v.switches&&z>=17)labels.push(...d.switches.filter(s=>s.ref).map(s=>({text:s.ref,lon:s.lon,lat:s.lat,size:10,small:true})));
    if(labels.length)layers.push(new TextLayer({id:'labels',data:labels,getPosition:l=>[l.lon,l.lat],getText:l=>l.text,getSize:l=>l.size,
      sizeUnits:'pixels',getColor:l=>l.small?[60,60,60]:[25,25,25],getPixelOffset:l=>l.small?[0,-10]:[0,-15],fontWeight:600,fontFamily:FONT,
      outlineWidth:3,outlineColor:[255,255,255,230],fontSettings:{sdf:true},characterSet:'auto',background:false}));
    if(this.selected)layers.push(new ScatterplotLayer({id:'selected',data:[this.selected],getPosition:s=>s.pos,getRadius:14,radiusUnits:'pixels',
      filled:false,stroked:true,getLineColor:[255,0,128],lineWidthUnits:'pixels',getLineWidth:3}));
    const trains=this.sim.trains();
    if(trains.length)layers.push(
      new IconLayer({id:'trains',data:trains.flatMap(t=>trainFormation(t,z)),getIcon:t=>trainIcon(t.skin),
        getPosition:t=>t.position,getAngle:t=>t.angle,getSize:6,sizeUnits:'pixels',sizeScale:1,autoPacking:true,pickable:true,autoHighlight:true,
        updateTriggers:{getPosition:this.sim.tick,getAngle:this.sim.tick}}),
      new TextLayer({id:'train-labels',data:trains,getPosition:t=>[t.position.lng,t.position.lat],getText:t=>t.id,getSize:11,sizeUnits:'pixels',
        getPixelOffset:[0,-18],fontFamily:FONT,outlineWidth:3,outlineColor:[255,255,255],fontSettings:{sdf:true},updateTriggers:{getPosition:this.sim.tick}}));
    this.map.setLayers(layers);
  }

  renderLegend(){
    const rows=legend(this.style);
    const box=$('legend');
    box.replaceChildren(el('h3',{},STYLES.find(s=>s.id===this.style)?.label??'Legend'),
      ...rows.map(([c,l])=>el('div',{class:'legend-row'},el('i',{style:`background:${c}`}),l)),
      el('h3',{style:'margin-top:8px'},'Points'),
      el('div',{class:'legend-row'},el('i',{class:'dot',style:'background:#fff;border:2.5px solid #0a7cba'}),'Station / halt'),
      el('div',{class:'legend-row'},el('i',{class:'dot',style:'background:transparent;border:3px solid #0072bb'}),'Scope station (sheet line colour)'),
      ...SIGNAL_LEGEND.map(([k,c])=>el('div',{class:'legend-row'},el('i',{class:'dot',style:`background:${c}`}),`Signal: ${k.replace('_',' ')}`)),
      el('div',{class:'legend-row'},el('i',{class:'dot',style:'background:#282828'}),'Switch'));
  }

  click(info){
    const o=info?.object,id=info?.layer?.id;
    if(!o)return;
    const ref=featureRef(id,o);
    if(!ref){
      if(id==='scope')toast(`${o.name}: ${o.status} (${o.line??'no line'})`);
      return;
    }
    this.inspect(ref.type,ref.id,info.coordinate);
  }

  async inspect(type,id,coordinate){
    try{
      const f=await api(`/map/feature/${type}/${id}`);
      const t=f.tags;
      const row=f.typed[0]?.row??{};
      const lat=row.lat??coordinate?.[1],lon=row.lon??coordinate?.[0];
      if(lat!=null&&lon!=null){this.selected={pos:[lon,lat]};this.render();}
      $('inspector-title').textContent=t.name||t.ref||row.name||row.ref||`${type} ${id}`;
      const body=[];
      body.push(el('p',{class:'muted',style:'margin:6px 0'},`${type}/${id}`+(f.typed.length?` · ${f.typed.map(x=>x.table).join(', ')}`:'')));
      body.push(el('h3',{},'OSM tags'),kv(t));
      for(const {table,row:r} of f.typed)body.push(el('h3',{},table),kv(r));
      if(f.placement.length)body.push(el('h3',{},'Track placement'),kv(Object.fromEntries(f.placement.map(p=>[`edge ${p.edge_id} (way ${p.way_id})`,`${p.feature_kind} @ ${fmt(Math.round(p.offset_m))} m of ${fmt(Math.round(p.length_m))} m${p.facing?' · '+p.facing:''}${p.snap_m?` · ${Math.round(p.snap_m)} m off track`:''}`]))));
      if(f.routes.length)body.push(el('h3',{},'Routes'),el('div',{class:'links'},...f.routes.map(r=>el('button',{type:'button',onclick:()=>this.sim.select(r.relation_id)},r.name||r.ref||r.relation_id))));
      if(f.scope.length)body.push(el('h3',{},'Scope (stations.xlsx)'),kv(Object.fromEntries(f.scope.map(s=>[s.name,s.match_status]))));
      const table=f.typed[0]?.table;
      body.push(el('div',{class:'links'},
        table?el('button',{type:'button',onclick:()=>this.onOpenData(this.config.worldDb,table,keyOf(table,type,id))},'Open in Data'):null,
        el('button',{type:'button',onclick:()=>this.onOpenData(this.config.worldDb,`osm_${type}`,{column:'id',value:id})},'Raw OSM row'),
        el('a',{href:`https://www.openstreetmap.org/${type}/${id}`,target:'_blank',rel:'noopener'},'openstreetmap.org'),
        lat!=null?el('a',{href:`https://openrailwaymap.app/#view=17/${lat.toFixed(5)}/${lon.toFixed(5)}`,target:'_blank',rel:'noopener'},'openrailwaymap.app'):null));
      $('inspector-body').replaceChildren(...body);
      $('inspector').hidden=false;
    }catch(e){toast(e.message,'error');}
  }

  simLog(message){
    const log=$('sim-log');
    log.prepend(el('p',{},`[${new Date().toLocaleTimeString()}] ${message}`));
    while(log.children.length>80)log.lastChild.remove();
  }

  writeHash(v){
    if(!v||!location.hash.startsWith('#/map'))return;
    history.replaceState(null,'',`#/map?view=${v.zoom}/${v.lat.toFixed(5)}/${v.lon.toFixed(5)}&style=${this.style}`);
  }
  resize(){window.dispatchEvent(new Event('resize'));}
}

function parseHashView(){
  const m=/view=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(location.hash);
  return m?{zoom:Number(m[1]),latitude:Number(m[2]),longitude:Number(m[3])}:null;
}

function featureRef(layer,o){
  switch(layer){
    case 'tracks':return {type:'way',id:o.id};
    case 'signals':case 'switches':return {type:'node',id:o.id};
    case 'stations':case 'platforms':case 'platform-nodes':case 'pois':return {type:o.type,id:o.id};
    case 'scope':return o.osm_type&&o.osm_id?{type:o.osm_type,id:o.osm_id}:null;
    default:return null;
  }
}

function keyOf(table,type,id){
  if(table==='rail_track')return {column:'way_id',value:id};
  if(['rail_signal','rail_switch','topo_node'].includes(table))return {column:'node_id',value:id};
  if(['rail_route','rail_route_master'].includes(table))return {column:'relation_id',value:id};
  return {column:'osm_id',value:id};
}

function kv(obj){
  const entries=Object.entries(obj??{}).filter(([,v])=>v!==null&&v!==undefined&&v!=='');
  if(!entries.length)return el('p',{class:'muted'},'none');
  return el('table',{class:'tags'},el('tbody',{},...entries.sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>el('tr',{},el('td',{},k),el('td',{},typeof v==='object'?JSON.stringify(v):String(v))))));
}

function tooltip(layer,o){
  const text=(()=>{switch(layer){
    case 'tracks':return [o.name||o.ref||o.railway,o.usage||o.service,o.maxspeed?`${o.maxspeed} km/h`:null,o.state!=='present'?o.state:null].filter(Boolean).join(' · ');
    case 'signals':return `Signal ${o.ref??''} · ${o.category??'?'}${o.direction?' · '+o.direction:''}`;
    case 'switches':return `Switch ${o.ref??''}${o.switch_type?' · '+o.switch_type:''}`;
    case 'stations':return `${o.name??'(unnamed)'} · ${o.kind}`;
    case 'scope':return `${o.name} · ${o.line??''} · ${o.status}`;
    case 'platforms':case 'platform-nodes':return `Platform ${o.ref??''}${o.height?` · ${o.height} m`:''}`;
    case 'pois':return `${o.kind.replaceAll('_',' ')}${o.name?' · '+o.name:''}${o.ref?' · '+o.ref:''}${o.position?' · km '+o.position:''}`;
    case 'trains':return o.name;
    default:return null;
  }})();
  return text?{text,style:{fontSize:'12px',padding:'4px 7px',background:'rgba(255,255,255,.96)',color:'#222',borderRadius:'4px',boxShadow:'0 1px 4px rgba(0,0,0,.3)'}}:null;
}
