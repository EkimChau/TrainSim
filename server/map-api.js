/**
 * Map API over the TrainSim world database. Every query runs through DbConsole.run
 * with source='api', so map traffic shows up in the query log with call counts.
 */
import {SIMWORLD_DB,simworldReady} from './simworld.js';

const num=v=>{const n=Number(v);if(!Number.isFinite(n))throw new Error('invalid number');return n;};
const json=s=>{try{return s?JSON.parse(s):null;}catch{return null;}};
const SERVICE_DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function validDate(value){
  const date=String(value??'');
  const parsed=new Date(`${date}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)
    throw new Error('date must be a valid YYYY-MM-DD value');
  return date;
}

function previousDate(date){
  return new Date(new Date(`${date}T00:00:00Z`).getTime()-86400000).toISOString().slice(0,10);
}

function holidayActive(holidays,seconds){
  return holidays.some(holiday=>{
    if(holiday.holiday_kind==='full-day')return true;
    const toSeconds=value=>{
      if(!value)return null;
      const [hours,minutes]=value.split(':').map(Number);
      return hours*3600+minutes*60;
    };
    const start=toSeconds(holiday.start_time),end=toSeconds(holiday.end_time);
    const clock=seconds%86400;
    return start!==null&&end!==null&&clock>=start&&clock<end;
  });
}

function shapeMeasures(points){
  const lengths=[0];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
    const dlat=lat2-lat1,dlng=(b.lon-a.lon)*Math.PI/180;
    const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
    lengths.push(lengths.at(-1)+12742000*Math.asin(Math.min(1,Math.sqrt(h))));
  }
  return {lengths,total:lengths.at(-1)};
}

function stopChainage(points,lengths,stop,minChainage=0){
  let closest={distance:Infinity,chainage:0};
  let first=0;
  while(first<points.length-2&&lengths[first+1]<minChainage)first++;
  for(let i=first;i<points.length-1;i++){
    const a=points[i],b=points[i+1],meanLat=(a.lat+b.lat+stop.lat)/3*Math.PI/180;
    const dx=(b.lon-a.lon)*Math.cos(meanLat),dy=b.lat-a.lat;
    const px=(stop.lon-a.lon)*Math.cos(meanLat),py=stop.lat-a.lat;
    const minFraction=i===first?Math.max(0,Math.min(1,(minChainage-lengths[i])/(lengths[i+1]-lengths[i]||1))):0;
    const fraction=Math.max(minFraction,Math.min(1,Math.max(0,(dx*px+dy*py)/(dx*dx+dy*dy||1))));
    const x=px-dx*fraction,y=py-dy*fraction,distance=x*x+y*y;
    if(distance<closest.distance)
      closest={distance,chainage:lengths[i]+(lengths[i+1]-lengths[i])*fraction};
  }
  return closest.chainage;
}

function shapePosition(points,lengths,chainage){
  const target=Math.max(0,Math.min(lengths.at(-1),chainage));
  let segment=0;
  while(segment<lengths.length-2&&lengths[segment+1]<target)segment++;
  while(segment<points.length-2&&lengths[segment+1]===lengths[segment])segment++;
  const a=points[segment],b=points[segment+1];
  const span=lengths[segment+1]-lengths[segment];
  const t=span?(target-lengths[segment])/span:0;
  const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180,dlng=(b.lon-a.lon)*Math.PI/180;
  const bearing=(Math.atan2(Math.sin(dlng)*Math.cos(lat2),
    Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlng))*180/Math.PI+360)%360;
  return {position:{lat:a.lat+(b.lat-a.lat)*t,lng:a.lon+(b.lon-a.lon)*t},bearing};
}

function positionAtSchedule(stops,seconds){
  if(seconds<stops[0].departure_seconds)return stops[0].chainage;
  for(let i=0;i<stops.length-1;i++){
    const from=stops[i],to=stops[i+1];
    if(seconds<from.departure_seconds)return from.chainage;
    if(seconds<=to.arrival_seconds){
      const duration=to.arrival_seconds-from.departure_seconds;
      const fraction=duration>0?(seconds-from.departure_seconds)/duration:1;
      return from.chainage+(to.chainage-from.chainage)*Math.max(0,Math.min(1,fraction));
    }
  }
  return stops.at(-1).chainage;
}

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
  constructor(dbConsole,root,dbId=SIMWORLD_DB){
    if(dbId!==SIMWORLD_DB)throw new Error('Runtime database must be the isolated SimWorld database');
    this.c=dbConsole;this.root=root;this.id=dbId;this.shapeCache=new Map();
    this.shapeMeasureCache=new Map();this.stopChainageCache=new Map();
  }
  available(){return simworldReady(this.root);}
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

  calendarStatus(){
    if(!this.available())return {available:false};
    return this.withDb(q=>{
      if(!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name='translink_feed'").length)
        return {available:false};
      const feed=q('SELECT source_url, fetched_at, feed_start, feed_end, attribution FROM translink_feed WHERE feed_id=1')[0];
      if(!feed)return {available:false};
      return {...feed,available:true,
        routes:q('SELECT count(*) AS count FROM translink_route')[0].count,
        trips:q('SELECT count(*) AS count FROM translink_trip')[0].count,
        holidays:q('SELECT count(DISTINCT holiday_date) AS count FROM sim_public_holiday')[0].count};
    });
  }

  calendar({date:dateValue,time:timeValue}){
    const date=validDate(dateValue);
    const seconds=num(timeValue);
    if(!Number.isInteger(seconds)||seconds<0||seconds>=86400)throw new Error('time must be whole seconds from 0 to 86399');
    return this.withDb(q=>{
      if(!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name='translink_feed'").length)
        throw new Error('Translink timetable is not loaded; run npm run ingest:translink');
      const feed=q('SELECT sha256 FROM translink_feed WHERE feed_id=1')[0];
      if(!feed)throw new Error('Translink timetable is not loaded; run npm run ingest:translink');
      if(this.feedHash!==feed.sha256){
        this.shapeCache.clear();
        this.shapeMeasureCache.clear();
        this.stopChainageCache.clear();
        this.feedHash=feed.sha256;
      }
      const holidays=q(`SELECT name, region, holiday_kind, start_time, end_time
        FROM sim_public_holiday WHERE holiday_date=? ORDER BY region, name`,[date]);
      const daysToCheck=[{date,seconds}];
      if(seconds<6*3600)daysToCheck.push({date:previousDate(date),seconds:seconds+86400});
      const activeTrips=[];
      for(const day of daysToCheck){
        const weekday=SERVICE_DAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
        const serviceHolidays=day.date===date?holidays:q(`SELECT holiday_kind, start_time, end_time
          FROM sim_public_holiday WHERE holiday_date=?`,[day.date]);
        const useSunday=holidayActive(serviceHolidays,day.seconds);
        const serviceDay=useSunday?'sunday':weekday;
        const services=new Set(q(`SELECT service_id FROM translink_service WHERE ${serviceDay}=1`).map(r=>r.service_id));
        for(const exception of q('SELECT service_id, exception_type FROM translink_service_date WHERE service_date=?',[day.date])){
          if(exception.exception_type===1)services.add(exception.service_id);
          else services.delete(exception.service_id);
        }
        if(!services.size)continue;
        const ids=[...services];
        const marks=ids.map(()=>'?').join(',');
        activeTrips.push(...q(`SELECT t.trip_id, t.route_id, t.service_id, t.headsign, t.shape_id, t.train_id,
            r.short_name AS route_short_name, r.long_name AS route_long_name,
            min(st.departure_seconds) AS start_seconds, max(st.arrival_seconds) AS end_seconds
          FROM translink_trip t
          JOIN translink_route r USING(route_id)
          JOIN translink_stop_time st USING(trip_id)
          WHERE t.service_id IN (${marks})
          GROUP BY t.trip_id
          HAVING start_seconds<=? AND end_seconds>=?`,
        [...ids,day.seconds,day.seconds]).map(t=>({...t,service_seconds:day.seconds,service_date:day.date})));
      }
      if(!activeTrips.length)return {date,time:seconds,holidays,trains:[]};

      const trainIds=activeTrips.map(t=>t.trip_id);
      const marks=trainIds.map(()=>'?').join(',');
      const stopTimes=q(`SELECT st.trip_id, st.stop_id, st.stop_sequence, st.arrival_seconds, st.departure_seconds,
          s.name, s.lat, s.lon
        FROM translink_stop_time st JOIN translink_stop s USING(stop_id)
        WHERE st.trip_id IN (${marks}) ORDER BY st.trip_id, st.stop_sequence`,trainIds);
      const stops=new Map();
      for(const stop of stopTimes){
        const list=stops.get(stop.trip_id)??[];
        list.push(stop);stops.set(stop.trip_id,list);
      }
      const shapeIds=[...new Set(activeTrips.map(t=>t.shape_id))];
      const missingShapeIds=shapeIds.filter(id=>!this.shapeCache.has(id));
      if(missingShapeIds.length){
        const shapeMarks=missingShapeIds.map(()=>'?').join(',');
        for(const point of q(`SELECT shape_id, lat, lon FROM translink_shape_point
            WHERE shape_id IN (${shapeMarks}) ORDER BY shape_id, sequence`,missingShapeIds)){
          const points=this.shapeCache.get(point.shape_id)??[];
          points.push({lat:point.lat,lon:point.lon});
          this.shapeCache.set(point.shape_id,points);
        }
      }
      const engines=new Map(q(`SELECT train_id AS id, engine_type AS type, skin, carriage_count AS carriages
        FROM rail_emu_train ORDER BY train_id`).map(engine=>[engine.id,engine]));
      const trains=activeTrips.flatMap(trip=>{
        const path=this.shapeCache.get(trip.shape_id);
        if(!path||path.length<2)throw new Error(`GTFS shape ${trip.shape_id} is missing or incomplete`);
        const duration=trip.end_seconds-trip.start_seconds;
        if(duration<=0)throw new Error(`GTFS trip ${trip.trip_id} has invalid timetable bounds`);
        let measures=this.shapeMeasureCache.get(trip.shape_id);
        if(!measures){
          measures=shapeMeasures(path);
          this.shapeMeasureCache.set(trip.shape_id,measures);
        }
        const journey=stops.get(trip.trip_id);
        if(!journey?.length)throw new Error(`GTFS trip ${trip.trip_id} has no stop sequence`);
        let previousChainage=0;
        const scheduledStops=journey.map(stop=>{
          const key=`${trip.shape_id}:${trip.route_id}:${stop.stop_sequence}:${stop.stop_id}`;
          let chainage=this.stopChainageCache.get(key);
          if(chainage===undefined){
            chainage=stopChainage(path,measures.lengths,stop,previousChainage);
            this.stopChainageCache.set(key,chainage);
          }
          previousChainage=chainage;
          return {...stop,chainage};
        });
        const chainage=positionAtSchedule(scheduledStops,trip.service_seconds);
        const {position,bearing}=shapePosition(path,measures.lengths,chainage);
        const next=scheduledStops.find(s=>s.arrival_seconds>=trip.service_seconds);
        const engine=engines.get(trip.train_id);
        if(!engine)throw new Error(`QR EMU profile ${trip.train_id} is missing`);
        const firstStop=scheduledStops[0],lastStop=scheduledStops.at(-1);
        const serviceName=trip.route_long_name||trip.route_short_name||trip.route_id;
        return [{id:`${trip.trip_id}@${trip.service_date}`,tripId:trip.trip_id,routeId:trip.route_id,route:trip.route_long_name||trip.route_short_name||trip.route_id,
          serviceDate:trip.service_date,serviceName,engineId:engine.id,skin:engine.skin,carriages:engine.carriages,position,bearing,
          nextStop:next?.name??null,destination:trip.headsign||trip.route_long_name||'Destination unavailable',
          startStation:firstStop.name??firstStop.stop_id,endStation:lastStop.name??lastStop.stop_id,
          startSeconds:firstStop.departure_seconds??firstStop.arrival_seconds,
          endSeconds:lastStop.arrival_seconds??lastStop.departure_seconds}];
      });
      return {date,time:seconds,holidays,trains};
    });
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
    const r=this.q(`SELECT relation_id AS id, name, ref, colour, from_name, to_name, path_status AS status,
        path_length_m AS length_m, path_coords FROM rail_route WHERE relation_id=?`,[num(id)])[0];
    if(!r)throw new Error('Route not found');
    const stops=this.q(`SELECT m.seq, m.member_type AS type, m.member_id AS id,
        coalesce(s.name, f.name, json_extract(n.tags, '$.name')) AS name,
        coalesce(s.lat, f.lat, n.lat) AS lat, coalesce(s.lon, f.lon, n.lon) AS lon
      FROM rail_route_member m
      LEFT JOIN rail_station s ON s.osm_type=m.member_type AND s.osm_id=m.member_id
      LEFT JOIN rail_feature f ON f.osm_type=m.member_type AND f.osm_id=m.member_id
      LEFT JOIN osm_node n ON m.member_type='node' AND n.id=m.member_id
      WHERE m.relation_id=? AND m.role LIKE 'stop%' ORDER BY m.seq`,[r.id]);
    return {...r,path_coords:undefined,segments:json(r.path_coords)??[],stops};
  }
}
