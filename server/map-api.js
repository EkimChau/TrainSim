/**
 * Map API over the TrainSim world database. Every query runs through DbConsole.run
 * with source='api', so map traffic shows up in the query log with call counts.
 */
import fs from 'node:fs';
import path from 'node:path';

const num=v=>{const n=Number(v);if(!Number.isFinite(n))throw new Error('invalid number');return n;};
const json=s=>{try{return s?JSON.parse(s):null;}catch{return null;}};

/** Douglas–Peucker in degrees; keeps endpoints. */
export function simplify(coords,tolerance){
  if(!tolerance||coords.length<3)return coords;
  const keep=new Uint8Array(coords.length);keep[0]=keep[coords.length-1]=1;
  const stack=[[0,coords.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();
    let max=0,idx=-1;
    const [ax,ay]=coords[a],[bx,by]=coords[b],dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){
      const [px,py]=coords[i];
      const t=len?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len)):0;
      const d=Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
      if(d>max){max=d;idx=i;}
    }
    if(max>tolerance&&idx>0){keep[idx]=1;stack.push([a,idx],[idx,b]);}
  }
  return coords.filter((_,i)=>keep[i]);
}

export function parseBbox(q){
  const parts=String(q??'').split(',').map(num);
  if(parts.length!==4)throw new Error('bbox must be west,south,east,north');
  const [w,s,e,n]=parts;
  if(s>n||w>e)throw new Error('invalid bbox');
  return {w,s,e,n};
}

export class MapApi{
  constructor(dbConsole,root,dbId=process.env.TRAINSIM_DB||'data/trainsim.sqlite'){
    this.c=dbConsole;this.root=root;this.id=dbId;
  }
  available(){return fs.existsSync(path.join(this.root,this.id));}
  q(sql,args=[],opts={}){return this.c.run(this.id,sql,args,{source:'api',maxRows:50000,...opts}).rows;}
  withDb(fn){const db=this.c.open(this.id);try{return fn((sql,args=[])=>this.q(sql,args,{db}));}finally{db.close();}}

  /** Add the QR fleet catalog to databases created before it was introduced. */
  ensureTrainFleet(){
    const db=this.c.open(this.id);
    try{
      db.exec(`CREATE TABLE IF NOT EXISTS rail_emu_train (
        train_id TEXT PRIMARY KEY,
        engine_type TEXT NOT NULL DEFAULT 'QR EMU',
        skin TEXT NOT NULL CHECK (skin IN ('3a', '3b')),
        carriage_count INTEGER NOT NULL DEFAULT 3 CHECK (carriage_count IN (3, 6))
      )`);
      const insert=db.prepare('INSERT OR IGNORE INTO rail_emu_train(train_id, engine_type, skin, carriage_count) VALUES(?, ?, ?, 3)');
      for(let i=1;i<=6;i++)insert.run(`QR-EMU-${String(i).padStart(2,'0')}`,'QR EMU',i%2?'3a':'3b');
    }finally{db.close();}
  }

  engines(){
    return this.withDb(q=>q(`SELECT train_id AS id, engine_type AS type, skin, carriage_count AS carriages
      FROM rail_emu_train ORDER BY train_id`));
  }

  status(){
    if(!this.available())return {available:false,database:this.id};
    return this.withDb(q=>{
      const run=q("SELECT run_id, started_at, finished_at, source, status, stats_json FROM ingest_run ORDER BY run_id DESC LIMIT 1")[0]??null;
      const okRun=q("SELECT run_id FROM ingest_run WHERE status='ok' ORDER BY run_id DESC LIMIT 1")[0];
      const coverage=okRun?q('SELECT metric, numerator, denominator, note FROM coverage WHERE run_id=? ORDER BY rowid',[okRun.run_id]):[];
      const extent=q('SELECT min(min_lon) w, min(min_lat) s, max(max_lon) e, max(max_lat) n FROM rail_track')[0];
      const lines=q('SELECT line_id, name, colour FROM scope_line ORDER BY name');
      return {available:true,database:this.id,lastRun:run&&{...run,stats:json(run.stats_json),stats_json:undefined},coverage,extent:extent?.w==null?null:extent,lines};
    });
  }

  /** Viewport features for every ORM layer, gated by zoom like openrailwaymap.app. */
  features({bbox,zoom}){
    const {w,s,e,n}=parseBbox(bbox);const z=num(zoom??12);
    const tol=z>=15?0:360/(256*2**z)*0.6; // ~0.6 px
    return this.withDb(q=>{
      const trackFilter=z<8?"AND t.state='present' AND t.usage IN ('main') AND t.service IS NULL":
        z<10?"AND t.state IN ('present','construction') AND t.service IS NULL AND (t.usage IN ('main','branch') OR t.railway<>'rail')":
        z<12?'AND t.service IS NULL':'';
      const tracks=q(`SELECT t.way_id AS id, t.railway, t.state, t.usage, t.service, t.ref, t.name, t.maxspeed, t.maxspeed_forward,
          t.maxspeed_backward, t.electrified, t.voltage, t.frequency, t.gauge, t.gauge_mm, t.train_protection, t.tunnel, t.bridge, t.coords
        FROM rtree_track r JOIN rail_track t ON t.way_id=r.way_id
        WHERE r.max_lat>=? AND r.min_lat<=? AND r.max_lon>=? AND r.min_lon<=? ${trackFilter}`,[s,n,w,e])
        .map(t=>({...t,coords:simplify(json(t.coords)??[],tol)}));
      const box=[s,n,w,e];
      const inBox='lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?';
      const stations=z>=8?q(`SELECT osm_type AS type, osm_id AS id, kind, name, railway_ref AS ref, lat, lon FROM rail_station
          WHERE ${inBox} ${z<12?"AND kind IN ('station','halt')":''} LIMIT 5000`,box):[];
      const scope=q(`SELECT s.station_id AS id, s.name, s.match_status AS status, s.osm_type, s.osm_id, s.lat, s.lon, l.name AS line, l.colour
          FROM scope_station s LEFT JOIN scope_line l USING(line_id) WHERE s.lat BETWEEN ? AND ? AND s.lon BETWEEN ? AND ?`,box);
      const signals=z>=13?q(`SELECT node_id AS id, ref, category, direction, deactivated, lat, lon FROM rail_signal WHERE ${inBox} LIMIT 20000`,box):[];
      const switches=z>=14?q(`SELECT node_id AS id, ref, switch_type, turnout_side, lat, lon FROM rail_switch WHERE ${inBox} LIMIT 20000`,box):[];
      const platforms=z>=14?q(`SELECT osm_type AS type, osm_id AS id, ref, name, height, lat, lon, coords FROM rail_platform WHERE ${inBox} LIMIT 10000`,box)
        .map(p=>({...p,coords:json(p.coords)})):[];
      const pois=z>=13?q(`SELECT osm_type AS type, osm_id AS id, kind, ref, name, railway_position AS position, lat, lon,
          CASE WHEN kind='landuse' THEN coords END AS coords FROM rail_feature WHERE ${inBox} ${z<15?"AND kind NOT IN ('landuse')":''} LIMIT 20000`,box)
        .map(p=>({...p,coords:json(p.coords)})):[];
      return {zoom:z,tracks,stations,scope,signals,switches,platforms,pois};
    });
  }

  /** Everything known about one OSM object: raw tags, typed row, topology placement, routes. */
  feature(type,id){
    if(!['node','way','relation'].includes(type))throw new Error('type must be node, way or relation');
    id=num(id);
    return this.withDb(q=>{
      const raw=q(`SELECT id, version, timestamp, user, changeset, tags FROM osm_${type} WHERE id=?`,[id])[0];
      const typed=[];
      const lookups=type==='way'?[['rail_track','way_id'],['rail_platform',null],['rail_station',null],['rail_feature',null]]:
        type==='node'?[['rail_signal','node_id'],['rail_switch','node_id'],['rail_station',null],['rail_platform',null],['rail_feature',null],['topo_node','node_id']]:
        [['rail_route','relation_id'],['rail_route_master','relation_id'],['rail_station',null],['rail_feature',null]];
      for(const [table,key] of lookups){
        const row=key?q(`SELECT * FROM ${table} WHERE ${key}=?`,[id])[0]:q(`SELECT * FROM ${table} WHERE osm_type=? AND osm_id=?`,[type,id])[0];
        if(row){delete row.coords;delete row.path_coords;typed.push({table,row});}
      }
      const placement=q(`SELECT f.edge_id, f.feature_kind, f.offset_m, f.snap_m, f.facing, e.way_id, e.length_m
          FROM topo_edge_feature f JOIN topo_edge e USING(edge_id) WHERE f.osm_type=? AND f.osm_id=?`,[type,id]);
      const routes=q(`SELECT DISTINCT r.relation_id, r.name, r.ref, r.colour FROM rail_route_member m JOIN rail_route r USING(relation_id)
          WHERE m.member_type=? AND m.member_id=? ORDER BY r.name`,[type,id]);
      const scope=type==='node'||type==='way'?q('SELECT station_id, name, match_status FROM scope_station WHERE osm_type=? AND osm_id=?',[type,id]):[];
      return {type,id,tags:json(raw?.tags)??{},meta:raw?{...raw,tags:undefined}:null,typed,placement,routes,scope};
    });
  }

  search(text){
    const term=String(text??'').trim();
    if(term.length<2)return [];
    const like=`%${term}%`;
    return this.withDb(q=>[
      ...q(`SELECT 'station' AS kind, osm_type AS type, osm_id AS id, name, kind AS detail, lat, lon FROM rail_station
            WHERE name LIKE ? OR railway_ref LIKE ? ORDER BY kind<>'station', length(name) LIMIT 15`,[like,like]),
      ...q(`SELECT 'scope' AS kind, NULL AS type, station_id AS id, name, match_status AS detail, lat, lon FROM scope_station
            WHERE name LIKE ? AND lat IS NOT NULL LIMIT 10`,[like]),
      ...q(`SELECT 'signal' AS kind, 'node' AS type, node_id AS id, ref AS name, category AS detail, lat, lon FROM rail_signal WHERE ref LIKE ? LIMIT 10`,[like]),
      ...q(`SELECT 'switch' AS kind, 'node' AS type, node_id AS id, ref AS name, switch_type AS detail, lat, lon FROM rail_switch WHERE ref LIKE ? LIMIT 10`,[like]),
      ...q(`SELECT 'milestone' AS kind, osm_type AS type, osm_id AS id, railway_position AS name, kind AS detail, lat, lon FROM rail_feature
            WHERE kind='milestone' AND railway_position LIKE ? LIMIT 10`,[like]),
    ]);
  }

  routes(){
    if(!this.available())return [];
    return this.q(`SELECT relation_id AS id, route, ref, name, colour, path_status AS status, path_gaps AS gaps,
        round(path_length_m) AS length_m, stop_count FROM rail_route ORDER BY path_status<>'ok', name`);
  }
  route(id){
    const r=this.q('SELECT relation_id AS id, name, ref, colour, path_status AS status, path_length_m AS length_m, path_coords FROM rail_route WHERE relation_id=?',[num(id)])[0];
    if(!r)throw new Error('Route not found');
    return {...r,path_coords:undefined,segments:json(r.path_coords)??[]};
  }
}
