// Simulation panel: plays a train along an ingested OSM route with the shared SimRun engine.
import {api,el,fmt,toast} from '../api.js';
import {SimRun} from '../../shared/simrun.js';
import {createRouteScene} from '../../shared/simscene.js';

const $=id=>document.getElementById(id);
const TICK_MS=100;
const TIME_SCALE=10; // 1 s of wall time = 10 s simulated

export class Simulation{
  constructor({onFrame,log,onFit}){
    this.onFrame=onFrame;this.log=log;this.onFit=onFit;
    this.runner=null;this.timer=null;this.path=null;this.tick=0;this.engines=[];
    $('sim-play').addEventListener('click',()=>this.play());
    $('sim-stop').addEventListener('click',()=>this.stop());
    $('sim-speed').addEventListener('input',()=>this.applySpeed());
  }
  async loadRoutes(){
    const sel=$('sim-route');
    try{
      const [{routes},{engines}]=await Promise.all([api('/map/routes'),api('/map/engines')]);
      this.engines=engines;
      const engineSel=$('sim-engine');
      engineSel.replaceChildren(...(engines.length?engines.map(e=>el('option',{value:e.id},
        `${e.id} · ${e.carriages} cars · skin ${e.skin}`)):[el('option',{value:''},'No QR EMU profiles in the database')]));
      engineSel.disabled=!engines.length;
      sel.replaceChildren(...(routes.length?routes.map(r=>el('option',{value:r.id},
        `${r.status==='ok'?'●':'◐'} ${r.name||r.ref||r.id} · ${fmt(Math.round((r.length_m??0)/100)/10)} km${r.status!=='ok'?` · ${r.gaps} gap(s)`:''}`)):
        [el('option',{value:''},'No OSM routes in the database')]));
      $('sim-play').disabled=!routes.length||!engines.length;
    }catch(e){
      sel.replaceChildren(el('option',{value:''},'Routes unavailable'));
      $('sim-engine').replaceChildren(el('option',{value:''},'Train profiles unavailable'));
      $('sim-play').disabled=true;
      toast(e.message,'error');
    }
  }
  select(id){$('sim-route').value=String(id);toast('Route selected in the Simulation panel');}
  speedPerTick(){return Number($('sim-speed').value)/3.6*TICK_MS/1000*TIME_SCALE;}
  applySpeed(){
    $('sim-speed').title=`${$('sim-speed').value} km/h`;
    for(const t of this.trains())t.speedMetersPerTick=this.speedPerTick();
  }
  async play(){
    const id=$('sim-route').value;
    if(!id)return;
    this.stop(false);
    try{
      const route=await api(`/map/routes/${id}`);
      const engineId=$('sim-engine').value;
      if(!engineId)throw new Error('Select a QR EMU train profile');
      const engine=this.engines.find(e=>e.id===engineId);
      if(!engine)throw new Error('Selected QR EMU profile is missing from the database');
      const {carriages,skin}=engine;
      const scene=createRouteScene(route,{speedMetersPerTick:this.speedPerTick(),engine});
      this.runner=new SimRun(scene);this.tick=0;
      this.path=scene.trains[0].path.map(p=>[p.lng,p.lat]);
      this.log(`Running ${engineId} (${carriages} cars, skin ${skin}) on ${route.name||id}: ${fmt(scene.trains[0].path.length)} OSM nodes, ${route.status==='ok'?'complete path':'longest continuous piece (route has gaps)'}`);
      $('sim-play').hidden=true;$('sim-stop').hidden=false;
      this.timer=setInterval(()=>this.step(),TICK_MS);
      this.onFrame();
    }catch(e){toast(e.message,'error');}
  }
  step(){
    const frame=this.runner.step();this.tick=frame.tick;
    $('sim-tick').textContent=`tick ${frame.tick} · ${Math.round(frame.tick*TICK_MS*TIME_SCALE/1000)} s sim`;
    if(frame.tick%50===0)for(const e of frame.events)this.log(e.message);
    this.onFrame();
  }
  stop(announce=true){
    clearInterval(this.timer);this.timer=null;
    if(announce&&this.runner)this.log('Stopped');
    this.runner=null;this.path=null;
    $('sim-play').hidden=false;$('sim-stop').hidden=true;$('sim-tick').textContent='idle';
    this.onFrame();
  }
  trains(){return this.runner?.scene.trains??[];}
}
