import {SEED_WORLD} from '../shared/seed-world.js';
import {SimWorld} from '../shared/simworld.js';
import {compileDemoInstruments} from '../shared/simspec.js';
import {SCENES,createScene} from '../shared/simscene.js';
import {SimRun} from '../shared/simrun.js';
import {SvgAdaptor} from './adapters/svg.js';
import {GoogleMapsAdaptor,loadGoogleMaps} from './adapters/google.js';

const $=id=>document.getElementById(id);
const state={world:new SimWorld(SEED_WORLD),adapter:null,objects:{tracks:[],stations:[],signals:[],trains:[]},timer:null,runner:null,compiled:false};
function log(message,level='info') {
  const p=document.createElement('p');p.className=`log-${level}`;
  p.textContent=`[${new Date().toLocaleTimeString()}] ${message}`;
  $('telemetry-log').prepend(p);
  while($('telemetry-log').children.length>120)$('telemetry-log').lastChild.remove();
}
function clear(type){for(const item of state.objects[type])item.remove();state.objects[type]=[];}
function setStatus(text,running=false){$('status-text').textContent=text;$('sim-status-overlay').classList.toggle('status-active',running);}
function layerChange(){for(const type of ['tracks','stations','signals'])for(const item of state.objects[type])item.setVisible($(`layer-${type}`).checked);}
function compile() {
  stop(false);for(const type of ['tracks','stations','signals'])clear(type);
  const result=compileDemoInstruments(state.world);
  state.objects.tracks=state.world.tracks.map(t=>state.adapter.addTrack(t));
  state.objects.stations=state.world.stations.map(s=>state.adapter.addPoint('station',s));
  state.objects.signals=result.devices.map(d=>state.adapter.addPoint('signal',{...d,position:d.position}));
  state.compiled=true;$('btn-play-sim').disabled=false;layerChange();
  setStatus('Infrastructure compiled · demo heuristic');
  log(`SimSpec: ${state.world.tracks.length} synthetic tracks, ${state.world.stations.length} stations, ${result.devices.length} illustrative balises.`, 'ok');
  log('NOT validated against live ORM or engineering regulations.', 'warn');
}
function updateTick() {
  const {events,trains}=state.runner.step();
  trains.forEach((train,i)=>{state.objects.trains[i].setPosition(train.position);state.objects.trains[i].setAlert(train.alert);});
  // Keep logging light; warn every tick but position logs at intervals.
  if(state.runner.tick%8===0||events.some(e=>e.type==='demo-warning'))for(const event of events)log(event.message,event.type==='demo-warning'?'warn':'info');
}
function start() {
  if(!state.compiled||state.timer)return;
  const scene=createScene($('scenario-selector').value,state.world);state.runner=new SimRun(scene);
  clear('trains');state.objects.trains=scene.trains.map(t=>state.adapter.addPoint('train',t));
  $('btn-play-sim').hidden=true;$('btn-stop-sim').hidden=false;$('btn-compile').disabled=true;$('scenario-selector').disabled=true;
  setStatus(`Running · ${scene.id}`,true);log(`SimRun started: ${scene.id}`,'ok');
  state.timer=setInterval(updateTick,300);
}
function stop(notify=true) {
  if(state.timer)clearInterval(state.timer);state.timer=null;state.runner=null;clear('trains');
  $('btn-play-sim').hidden=false;$('btn-stop-sim').hidden=true;$('btn-compile').disabled=false;$('scenario-selector').disabled=false;
  if(notify){setStatus(state.compiled?'Compiled · idle':'Idle');log('SimRun stopped.');}
}
const loadScript=url=>new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.async=true;el.onload=resolve;el.onerror=reject;document.head.append(el);});
async function initGIS(clientId) {
  const auth=$('auth-area');if(!clientId){auth.textContent='Guest demo · GIS not configured';return;}
  try {
    const me=await fetch('/api/auth/me').then(r=>r.json());
    if(me.user){renderUser(me.user);return;}
    await loadScript('https://accounts.google.com/gsi/client');
    window.google.accounts.id.initialize({client_id:clientId,callback:async ({credential})=>{
      const res=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});
      if(!res.ok){log('Google sign-in verification failed','warn');return;}renderUser((await res.json()).user);
    }});
    const slot=document.createElement('span');auth.replaceChildren(slot);
    window.google.accounts.id.renderButton(slot,{theme:'outline',size:'medium',text:'signin_with'});
  }catch{auth.textContent='Google sign-in unavailable';log('GIS could not load; local demo still works','warn');}
}
function renderUser(user){const area=$('auth-area');const name=document.createElement('span');name.textContent=user.email||user.name||'Signed in';
  const button=document.createElement('button');button.textContent='Sign out';button.className='subtle';button.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload();};area.replaceChildren(name,button);
}
async function bootstrap() {
  for(const scene of SCENES){const o=document.createElement('option');o.value=scene.id;o.textContent=scene.label;$('scenario-selector').append(o);}
  $('btn-compile').addEventListener('click',compile);$('btn-play-sim').addEventListener('click',start);$('btn-stop-sim').addEventListener('click',()=>stop());
  for(const name of ['tracks','stations','signals'])$(`layer-${name}`).addEventListener('change',layerChange);
  let config={mapsApiKey:'',gisClientId:''};
  try{const res=await fetch('/api/config');if(!res.ok)throw new Error('Server unavailable');config=await res.json();}catch(e){log(`API config failed: ${e.message}`,'warn');}
  if(config.mapsApiKey){try{const maps=await loadGoogleMaps(config.mapsApiKey);if(!maps)throw new Error('Google Maps unavailable');state.adapter=new GoogleMapsAdaptor($('map'),maps,config.region.center);}catch(e){log(`${e.message}; using schematic SVG demo`,'warn');}}
  if(!state.adapter)state.adapter=new SvgAdaptor($('map'),state.world);
  $('map-provider').textContent=state.adapter.name;
  log(`${state.adapter.name} ready. Synthetic Brisbane seed loaded.`,'ok');
  await initGIS(config.gisClientId);compile();
}
bootstrap().catch(error=>{log(`Startup failed: ${error.message}`,'warn');setStatus('Initialization error');});
