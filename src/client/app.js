// TrainSim shell: one top nav bar, global navigation and database switch (top right),
// hash routes #/map, #/data, #/query and #/docs (legacy #/readme redirects).
import 'tabulator-tables/dist/css/tabulator_simple.min.css';
import {api,el,store,toast} from './api.js';
import {MapView} from './map/view.js';
import {DataView} from './data/view.js';
import {QueryView} from './query/view.js';
import {DocsView} from './docs/view.js';

const $=id=>document.getElementById(id);
const ROUTES=['map','data','query','docs'];
const state={config:null,databases:[],database:''};
let mapView,dataView,queryView,docsView;

async function boot(){
  try{state.config=await api('/config');}
  catch(e){document.body.prepend(el('div',{class:'map-banner',style:'position:static;transform:none;margin:12px auto'},`TrainSim API unavailable: ${e.message}. Start it with npm start.`));return;}
  dataView=new DataView();
  queryView=new QueryView({getDatabase:()=>state.database,setDatabase:id=>selectDatabase(id)});
  docsView=new DocsView({onIngest:()=>loadDatabases()});
  mapView=new MapView({config:state.config,onOpenData:(db,table,filter)=>{selectDatabase(db,false);location.hash=`#/data?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}${filter?`&col=${encodeURIComponent(filter.column)}&val=${encodeURIComponent(filter.value)}`:''}`;}});
  await loadDatabases();
  $('global-db').addEventListener('change',e=>selectDatabase(e.target.value));
  window.addEventListener('hashchange',route);
  worldStatus();
  route();
}

async function loadDatabases(){
  try{
    state.databases=(await api('/db/databases')).databases;
    const sel=$('global-db');
    sel.replaceChildren(...state.databases.map(d=>el('option',{value:d.id},d.id+(d.readOnly?' · reference (read-only)':''))));
    const preferred=state.config.worldDb;
    const id=state.databases.some(d=>d.id===preferred)?preferred:(state.databases.find(d=>d.id===state.config.worldDb)?.id??state.databases[0]?.id??'');
    selectDatabase(id,false);
  }catch(e){toast(e.message,'error');}
}

function selectDatabase(id,refresh=true){
  if(!id)return;
  state.database=id;$('global-db').value=id;store.set('database',id);
  if(!refresh)return;
  const r=current();
  if(r==='data')dataView.setDatabase(id);
  if(r==='query')queryView.activate();
}

const current=()=>{const r=(location.hash.match(/^#\/(\w+)/)||[])[1];return ROUTES.includes(r)?r:'map';};

function route(){
  if(location.hash.startsWith('#/readme')){location.replace(location.hash.replace('#/readme','#/docs'));return;}
  const r=current();
  document.querySelector('.db-switch').hidden=r==='docs';
  $('world-status').hidden=r==='docs';
  for(const name of ROUTES){$(`view-${name}`).hidden=name!==r;}
  for(const a of document.querySelectorAll('.global-nav a')){if(a.dataset.route===r)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  const params=new URLSearchParams(location.hash.split('?')[1]??'');
  if(r==='map'){mapView.start().then(()=>mapView.resize());}
  else if(r==='data'){
    const db=params.get('db');
    if(db&&state.databases.some(d=>d.id===db))selectDatabase(db,false);
    dataView.setDatabase(state.database).then(()=>{
      const table=params.get('table');
      if(table)dataView.open(table,params.get('col')?{column:params.get('col'),value:params.get('val')}:null);
    });
  }else if(r==='query')queryView.activate();
  else if(r==='docs')docsView.activate(params);
}

async function worldStatus(){
  const dot=$('world-status');
  try{
    const s=await api('/map/status');
    if(!s.available){dot.className='status-dot bad';dot.title=`${s.database} not found: run npm run ingest`;return;}
    const run=s.lastRun;
    dot.className=`status-dot ${run?.status==='ok'?'ok':'warn'}`;
    const matched=s.coverage.find(c=>c.metric==='scope_stations_matched');
    dot.title=`${s.database}\nLast ingest: ${run?.status??'none'} · ${run?.finished_at??run?.started_at??''} (${run?.source??''})`+
      (matched?`\nSheet stations matched: ${matched.numerator}/${matched.denominator}`:'');
  }catch{dot.className='status-dot bad';}
}

boot();
