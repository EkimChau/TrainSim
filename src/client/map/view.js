import {IconLayer,PathLayer,ScatterplotLayer,TextLayer,PolygonLayer} from '@deck.gl/layers';
import {PathStyleExtension} from '@deck.gl/extensions';
import {api,el,fmt,store,toast} from '../api.js';
import {BASEMAP_TYPES,createBasemap,rasterLayer,SEQ_VIEW} from './basemap.js';
import {STYLES,STATION_COLOUR,hex,legend,poiColour,signalColour,trackColour,trackDash,trackWidth,SIGNAL_LEGEND} from './styles.js';
import {Simulation} from './sim.js';
import {formatServiceTime,TimeSimulation} from './time-sim.js';
import {trainFormation,trainIconAngle} from '../../shared/formation.js';
import {trainIcon} from './train-icons.js';

const $=id=>document.getElementById(id);
const dash=new PathStyleExtension({dash:true});
const FONT='system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const ORM_TILES=style=>['a','b','c'].map(s=>`https://${s}.tiles.openrailwaymap.org/${style}/{z}/{x}/{y}.png`);

function destination(point,bearing,distance){
  const radius=6371000,angular=distance/radius,heading=bearing*Math.PI/180,lat1=point.lat*Math.PI/180,lon1=point.lng*Math.PI/180;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(angular)+Math.cos(lat1)*Math.sin(angular)*Math.cos(heading));
  const lon2=lon1+Math.atan2(Math.sin(heading)*Math.sin(angular)*Math.cos(lat1),
    Math.cos(angular)-Math.sin(lat1)*Math.sin(lat2));
  return {lat:lat2*180/Math.PI,lng:((lon2*180/Math.PI+540)%360)-180};
}

function clusterTrains(trains,zoom,cellSize){
  const worldSize=256*2**zoom;
  const groups=new Map();
  for(const train of trains){
    const sin=Math.sin(Math.max(-85,Math.min(85,train.position.lat))*Math.PI/180);
    const x=(train.position.lng+180)/360*worldSize;
    const y=(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*worldSize;
    const key=`${Math.floor(x/cellSize)}:${Math.floor(y/cellSize)}`;
    const group=groups.get(key)??[];
    group.push(train);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    if(group.length===1)return {...group[0],clusterCount:1};
    const lat=group.reduce((sum,t)=>sum+t.position.lat,0)/group.length;
    const lng=group.reduce((sum,t)=>sum+t.position.lng,0)/group.length;
    return {...group[0],position:{lat,lng},clusterCount:group.length};
  });
}

export class MapView{
  constructor({config,onOpenData}){
    this.config=config;this.onOpenData=onOpenData;
    const hashStyle=/[?&]style=(\w+)/.exec(location.hash)?.[1];
    this.style=STYLES.some(s=>s.id===hashStyle)?hashStyle:store.get('mapStyle','infrastructure');
    this.visible={tracks:true,stations:true,scope:true,platforms:true,signals:true,switches:true,pois:true,orm:false,timetable:true,
      ...store.get('mapLayers',{})};
    this.data={tracks:[],stations:[],scope:[],signals:[],switches:[],platforms:[],pois:[],zoom:10};
    this.selected=null;this.request=0;this.started=false;
    this.focusedTrainId=null;
    this.followTrain=false;this.followedPosition=null;this.trainListSignature='';
    this.trainListButtons=new Map();
    this.mode='time';
    this.sim=new Simulation({onFrame:()=>this.render(),log:(m)=>this.simLog(m)});
    this.timeSim=new TimeSimulation({onFrame:()=>this.render()});
    this.timeSim.setModeHandler(mode=>this.selectMode(mode));
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
    const basemap=$('basemap');
    const googleAvailable=this.map.kind==='google';
    for(const option of basemap.options)option.disabled=!googleAvailable&&option.value!=='osm';
    $('basemap-hint').hidden=googleAvailable;
    const savedBasemap=store.get('basemap','osm');
    this.basemapType=googleAvailable&&BASEMAP_TYPES.includes(savedBasemap)?savedBasemap:'osm';
    basemap.value=this.basemapType;
    basemap.title=googleAvailable?'Choose the map background':'Google base maps require a GOOGLE_MAPS_API_KEY';
    this.map.setType(this.basemapType);
    this.status=await api('/map/status').catch(()=>({available:false}));
    if(!this.status.available){
      const b=$('map-banner');b.hidden=false;
      b.replaceChildren('No world database yet. Run ',el('code',{},'npm run build:simworld'),' to populate ',el('code',{},this.config.worldDb),'.');
    }else if(this.status.extent&&!parseHashView()){
      const {w,s,e,n}=this.status.extent;this.map.fit([w,s,e,n]);
    }
    if(this.map.kind!=='google')toast('No GOOGLE_MAPS_API_KEY set: showing OpenStreetMap tiles instead of Google Maps.');
    this.sim.loadRoutes();
    this.timeSim.load();
    this.renderLegend();
    this.load();
  }

  selectMode(mode){
    this.mode=mode;
    const time=mode==='time';
    $('sim').classList.toggle('sim-time-mode',time);
    $('sim').classList.toggle('sim-single-mode',!time);
    $('sim-tab-time').setAttribute('aria-selected',String(time));
    $('sim-tab-single').setAttribute('aria-selected',String(!time));
    $('sim-time').hidden=!time;
    $('sim-single').hidden=time;
    if(time)$('sim-time').append($('train-detail'));
    else $('view-map').append($('train-detail'));
    if(time){this.sim.stop(false);this.timeSim.setValue(this.timeSim.value,false);}
    else{this.timeSim.pause();$('sim-tick').textContent='idle';}
    this.clearTrainFocus(false);
    this.render();
  }

  controls(){
    const sel=$('map-style');
    for(const s of STYLES)sel.append(el('option',{value:s.id},s.label));
    sel.value=this.style;
    sel.addEventListener('change',()=>{this.style=sel.value;store.set('mapStyle',this.style);this.renderLegend();this.render();this.writeHash(this.viewport);});
    for(const box of document.querySelectorAll('[data-layer]')){
      box.checked=!!this.visible[box.dataset.layer];
      box.addEventListener('change',()=>{
        this.visible[box.dataset.layer]=box.checked;
        if(box.dataset.layer==='timetable'&&!box.checked)this.clearTrainFocus(false);
        store.set('mapLayers',this.visible);this.render();
      });
    }
    $('basemap').addEventListener('change',e=>{
      const type=e.target.value;
      try{
        this.map?.setType(type);
        this.basemapType=type;
        store.set('basemap',type);
      }catch(error){
        $('basemap').value=this.basemapType;
        toast(error.message,'error');
      }
    });
    $('inspector-close').addEventListener('click',()=>{this.selected=null;$('inspector').hidden=true;this.render();});
    $('train-detail-close').addEventListener('click',()=>this.clearTrainFocus());
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.clearTrainFocus();});
    document.addEventListener('pointerdown',e=>{
      if(this.focusedTrainId&&!e.target.closest('#map')&&!e.target.closest('#sim')&&!e.target.closest('#train-detail'))this.clearTrainFocus();
    });
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
    if(this.mode==='single'&&this.sim.path)layers.push(new PathLayer({id:'sim-route',data:[{path:this.sim.path}],getPath:x=>x.path,getColor:[255,212,0,170],getWidth:9,widthUnits:'pixels',capRounded:true,jointRounded:true}));
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
    const trains=this.activeTrains();
    if(this.focusedTrainId&&!trains.some(t=>t.id===this.focusedTrainId)){
      this.focusedTrainId=null;
      this.followTrain=false;
      this.followedPosition=null;
      $('inspector').hidden=!this.selected;
    }
    this.renderTrainList(trains);
    this.followFocusedTrain(trains);
    if(trains.length&&this.mode==='single')layers.push(
      new IconLayer({id:'trains',data:trains.flatMap(t=>trainFormation(t,z,t.id===this.focusedTrainId?2:1)),getIcon:t=>trainIcon(t.skin),
        getPosition:t=>t.position,getAngle:t=>trainIconAngle(t.angle,this.sim.axisOffset),getSize:t=>t.iconSize,
        sizeUnits:'pixels',sizeScale:1,autoPacking:true,pickable:true,autoHighlight:true,
        updateTriggers:{getPosition:this.sim.tick,getAngle:`${this.sim.tick}:${this.sim.axisOffset}`,getSize:this.focusedTrainId}}),
      new TextLayer({id:'train-labels',data:trains,getPosition:t=>[t.position.lng,t.position.lat],getText:t=>t.engineId??t.id,getSize:11,sizeUnits:'pixels',
        getPixelOffset:[0,-18],fontFamily:FONT,outlineWidth:3,outlineColor:[255,255,255],fontSettings:{sdf:true},updateTriggers:{getPosition:this.sim.tick}}));
    if(trains.length&&this.mode==='time'&&v.timetable){
      const scale=Math.max(2,Math.min(10,2+(8-z)*1.5));
      const lollipops=clusterTrains(trains,z,Math.max(72,36*scale)).map(t=>{
        const iconScale=t.id===this.focusedTrainId?scale*1.25:scale;
        return {...t,path:[destination(t.position,t.bearing+180,10000),destination(t.position,t.bearing,10000)],
          segment:0,progress:0.5,iconScale};
      });
      const labels=lollipops.filter(t=>t.clusterCount===1&&(scale>=4||z>=12));
      const clusters=lollipops.filter(t=>t.clusterCount>1);
      layers.push(
        new IconLayer({id:'time-trains',data:lollipops.flatMap(t=>trainFormation(t,z,t.iconScale)
          .map(icon=>({...icon,clusterCount:t.clusterCount,clusterPosition:t.position}))),
          getIcon:t=>trainIcon(t.skin),getPosition:t=>t.position,getAngle:t=>trainIconAngle(t.angle,this.sim.axisOffset),
          getSize:t=>t.iconSize,sizeUnits:'pixels',sizeScale:1,autoPacking:true,pickable:true,autoHighlight:true,
          updateTriggers:{getPosition:this.timeSim.value,getAngle:`${this.timeSim.value}:${this.sim.axisOffset}`,getSize:this.focusedTrainId}}),
        new TextLayer({id:'time-train-labels',data:labels,getPosition:t=>[t.position.lng,t.position.lat],
          getText:t=>t.serviceName,getSize:Math.max(12,Math.min(16,12+(scale-2)*0.5)),sizeUnits:'pixels',
          getPixelOffset:[0,-18],fontFamily:FONT,fontWeight:700,outlineWidth:3,
          outlineColor:[255,255,255],fontSettings:{sdf:true},pickable:true,
          updateTriggers:{getPosition:this.timeSim.value,getText:this.timeSim.value}}),
        new TextLayer({id:'time-train-cluster-counts',data:clusters,getPosition:t=>[t.position.lng,t.position.lat],
          getText:t=>String(t.clusterCount),getSize:12,sizeUnits:'pixels',getPixelOffset:[23,-23],
          getColor:[25,25,25],fontFamily:FONT,fontWeight:700,pickable:true,
          updateTriggers:{getPosition:this.timeSim.value}}));
    }
    this.map.setLayers(layers);
    this.renderTrainDetails(trains.find(t=>t.id===this.focusedTrainId));
  }

  activeTrains(){return this.mode==='time'?this.timeSim.trainsNow():this.sim.trains();}

  focusTrain(id,{follow=this.mode==='time',focusList=false}={}){
    const train=this.activeTrains().find(t=>t.id===id);
    if(!train)return;
    this.focusedTrainId=id;
    this.followTrain=follow;
    this.followedPosition=follow?train.position:null;
    $('inspector').hidden=true;
    if(follow)this.map.flyTo(train.position.lat,train.position.lng,Math.min(18,Math.max(15,this.viewport?.zoom??10)));
    this.render();
    if(focusList)this.focusTrainListItem(id);
  }

  clearTrainFocus(render=true){
    if(!this.focusedTrainId)return;
    this.focusedTrainId=null;
    this.followTrain=false;
    this.followedPosition=null;
    $('train-detail').hidden=true;
    $('inspector').hidden=!this.selected;
    if(render)this.render();
  }

  followFocusedTrain(trains){
    if(!this.followTrain||!this.focusedTrainId)return;
    const train=trains.find(item=>item.id===this.focusedTrainId);
    if(!train)return;
    const previous=this.followedPosition;
    const latScale=111320,lonScale=latScale*Math.cos(train.position.lat*Math.PI/180);
    const distance=previous?Math.hypot(
      (train.position.lat-previous.lat)*latScale,
      (train.position.lng-previous.lng)*lonScale,
    ):Infinity;
    if(distance>60){
      this.followedPosition=train.position;
      this.map.flyTo(train.position.lat,train.position.lng);
    }
  }

  renderTrainList(trains){
    const list=$('time-train-list');
    const signature=`${this.focusedTrainId??''}\n${trains.map(train=>[
      train.id,train.engineId,train.serviceName,train.destination,train.startStation,train.startSeconds,
      train.endStation,train.endSeconds,train.serviceDate,
    ].join('|')).join('\n')}`;
    if(signature===this.trainListSignature)return;
    this.trainListSignature=signature;
    this.trainListButtons.clear();
    if(!trains.length){
      list.replaceChildren(el('p',{class:'time-train-empty'},'No trains in service at this simulation time.'));
      return;
    }
    const sorted=[...trains].sort((a,b)=>a.startSeconds-b.startSeconds||
      String(a.engineId).localeCompare(String(b.engineId))||String(a.id).localeCompare(String(b.id)));
    list.replaceChildren(el('ol',{class:'time-train-items'},
      ...sorted.map(train=>{
        const selected=train.id===this.focusedTrainId;
        const button=el('button',{type:'button',class:`time-train-entry${selected?' active':''}`,
          'aria-pressed':String(selected),onclick:()=>this.focusTrain(train.id,{follow:true,focusList:true})},
        el('strong',{class:'time-train-heading'},train.serviceName),
        el('span',{class:'time-train-destination'},train.destination),
        el('span',{class:'time-train-stops'},
          `${formatServiceTime(train.serviceDate,train.startSeconds)} ${train.startStation} → ${formatServiceTime(train.serviceDate,train.endSeconds)} ${train.endStation}`));
        this.trainListButtons.set(train.id,button);
        return el('li',{},button);
      })));
  }

  focusTrainListItem(id){
    const button=this.trainListButtons.get(id);
    if(!button)return;
    button.focus({preventScroll:true});
    button.scrollIntoView({block:'nearest'});
  }

  renderTrainDetails(train){
    const panel=$('train-detail');
    if(!train){panel.hidden=true;return;}
    const units=train.carriages/3;
    panel.hidden=false;
    $('train-detail-title').textContent=train.serviceName??train.id;
    $('train-detail-body').replaceChildren(
      el('div',{class:'train-detail-model',role:'img', 'aria-label':`${units} three-car QR EMU unit${units===1?'':'s'}`},
        ...Array.from({length:units},()=>el('img',{src:trainIcon(train.skin).url,alt:'Three-car QR EMU unit'}))),
      el('dl',{class:'train-detail-facts'},
        el('dt',{},'Formation'),el('dd',{},`${train.carriages} carriages · skin ${train.skin}`),
        train.serviceName?el('dt',{},'Service'):null,train.serviceName?el('dd',{},train.serviceName):null,
        train.startStation?el('dt',{},'Starts'):null,
        train.startStation?el('dd',{},`${formatServiceTime(train.serviceDate,train.startSeconds)} · ${train.startStation}`):null,
        train.endStation?el('dt',{},'Ends'):null,
        train.endStation?el('dd',{},`${formatServiceTime(train.serviceDate,train.endSeconds)} · ${train.endStation}`):null,
        el('dt',{},'Next stop'),el('dd',{},train.nextStop??'No stop data available'),
        el('dt',{},'Destination'),el('dd',{},train.destination??'Destination unavailable')));
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
    if(['trains','time-trains','time-train-labels'].includes(id)&&o){
      if(o.clusterCount>1){
        const center=o.clusterPosition??o.position;
        const [lon,lat]=Array.isArray(center)?center:[center.lng,center.lat];
        this.clearTrainFocus(false);
        this.map.flyTo(lat,lon,Math.min(18,(this.viewport?.zoom??10)+2));
        return;
      }
      this.focusTrain(o.trainId??o.id,{follow:this.mode==='time',focusList:this.mode==='time'});return;
    }
    if(id==='time-train-cluster-counts'&&o){
      this.clearTrainFocus(false);
      this.map.flyTo(o.position.lat,o.position.lng,Math.min(18,(this.viewport?.zoom??10)+2));
      return;
    }
    this.clearTrainFocus(false);
    if(!o){this.render();return;}
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
