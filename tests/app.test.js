import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {DbConsole,singleStatement} from '../server/db/console.js';
import {QueryLog} from '../server/db/query-log.js';
import {MapApi,simplify,parseBbox} from '../server/map-api.js';
import {createApp} from '../server/app.js';

const ROOT=path.resolve(import.meta.dirname,'..');

function project(t,{world=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data/esig'),{recursive:true});
  fs.mkdirSync(path.join(root,'db/trainsim'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'db/trainsim/saved-queries.json'),path.join(root,'db/trainsim/saved-queries.json'));
  const d=new DatabaseSync(path.join(root,'data/esig/demo.sqlite'));
  d.exec(`CREATE TABLE item(id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL);
          CREATE TABLE pair(a TEXT, b TEXT, PRIMARY KEY(a,b));
          INSERT INTO item VALUES('one','Station',1); INSERT INTO pair VALUES('A','B');`);
  d.close();
  if(world)execFileSync('python3',[path.join(ROOT,'scripts/ingest_osm.py'),'--source','file',path.join(ROOT,'data/fixtures/osm-seq-fixture.osm'),
    '--db',path.join(root,'data/trainsim.sqlite')],{stdio:'pipe'});
  const log=new QueryLog(path.join(root,'data/local/console.sqlite'));
  log.seed(path.join(root,'db/trainsim/saved-queries.json'));
  t.after(()=>log.close());
  return {root,log,store:new DbConsole(root,log),id:'data/esig/demo.sqlite'};
}

test('discovers every project SQLite database, ignoring fakes and symlinks',t=>{
  const {root,store}=project(t);
  fs.writeFileSync(path.join(root,'fake.sqlite'),'not sqlite');
  fs.symlinkSync('/etc/hosts',path.join(root,'data','bad.sqlite'));
  assert.deepEqual(store.databases(),['data/esig/demo.sqlite','data/local/console.sqlite']);
  assert.throws(()=>store.tables('../foreign.sqlite'),/not found/);
});

test('live browse, filter, sort, edit, add and delete',t=>{
  const {id,store}=project(t);
  assert.equal(store.browse(id,'item').total,1);
  assert.equal(store.edit(id,'item',{id:'one'},{name:'Central'}).changes,1);
  assert.equal(store.add(id,'item',{id:'two',name:'North',count:'5'}).changes,1);
  assert.equal(store.browse(id,'item',{filterColumn:'count',filterOp:'>',filterValue:'2'}).rows[0].name,'North');
  assert.equal(store.browse(id,'item',{filterColumn:'name',filterOp:'like',filterValue:'ent'}).total,1);
  assert.equal(store.browse(id,'item',{sort:'name',dir:'desc'}).rows[0].name,'North');
  assert.equal(store.delete(id,'item',[{id:'one'},{id:'two'}]).changes,2);
  assert.throws(()=>store.browse(id,'item',{filterColumn:'nope'}),/Unknown filter column/);
});

test('rows added are unique in every table',t=>{
  const {id,store}=project(t);
  assert.throws(()=>store.add(id,'item',{id:'different',name:'Station',count:1}),/Duplicate row blocked/);
  assert.throws(()=>store.execute(id,"INSERT INTO item VALUES('yet-another','Station',1)"),/Duplicate row blocked/);
  assert.throws(()=>store.add(id,'pair',{a:'A',b:'B'}),/constraint|Duplicate/);
  store.add(id,'events',{message:'unique message'});
  assert.throws(()=>store.add(id,'events',{message:'unique message'}),/Duplicate row blocked/);
});

test('every call is logged once per SQL text with call count and last-call order',t=>{
  const {id,store,log}=project(t);
  const sql='SELECT * FROM "item"';
  store.execute(id,sql);store.execute(id,sql);store.execute(id,'SELECT 1');
  const list=log.list();
  assert.equal(list[0].sql,'SELECT 1');
  const entry=list.find(x=>x.sql===sql);
  assert.equal(entry.count,2);
  assert.equal(log.calls(entry.id).length,2);
  log.rename(entry.id,'Items');
  assert.equal(log.get(entry.id).name,'Items');
  assert.throws(()=>store.execute(id,'SELECT 1; DELETE FROM item'),/one SQL/);
  assert.equal(singleStatement("SELECT ';' AS semi; -- c\n"),"SELECT ';' AS semi; -- c");
  assert.throws(()=>store.execute(id,'SELECT * FROM missing'),/no such table/);
  assert.ok(log.list().some(x=>x.lastError&&x.sql.includes('missing')),'failed calls are logged too');
});

test('presaved queries are unique and idempotently seeded',t=>{
  const {log,root}=project(t);
  const n=log.list().filter(x=>x.preset).length;
  log.seed(path.join(root,'db/trainsim/saved-queries.json'));
  assert.equal(log.list().filter(x=>x.preset).length,n);
  const id=log.save('data/esig/demo.sqlite','SELECT 2','two');
  assert.equal(log.save('data/esig/demo.sqlite','SELECT 2','renamed'),id);
});

test('map API serves the ingested world by viewport and logs as api calls',t=>{
  const {root,store,log}=project(t,{world:true});
  const map=new MapApi(store,root);
  const status=map.status();
  assert.equal(status.available,true);
  assert.equal(status.lastRun.status,'ok');
  const f=map.features({bbox:'152.90,-27.35,153.10,-27.20',zoom:16});
  assert.equal(f.tracks.length,5);
  assert.equal(f.signals.length,3);
  assert.equal(f.switches.length,2);
  assert.ok(f.stations.some(s=>s.name==='Petrie'));
  assert.equal(map.features({bbox:'152.90,-27.35,153.10,-27.20',zoom:7}).tracks.length,2,'low zoom shows main lines only');
  const sw=map.feature('node',1013);
  assert.equal(sw.tags.ref,'P101');
  assert.ok(sw.typed.some(x=>x.table==='rail_switch'));
  assert.ok(map.search('Petrie').length>0);
  const routes=map.routes();
  assert.equal(routes.find(r=>r.id===8001).status,'ok');
  assert.equal(map.route(8001).segments.length,1);
  const engines=map.engines();
  assert.equal(engines.length,6);
  assert.ok(engines.every(engine=>engine.carriages===3));
  assert.deepEqual(engines.map(engine=>engine.skin),['3a','3b','3a','3b','3a','3b']);
  map.ensureTrainFleet();
  assert.equal(map.engines().length,6,'fleet migration is safe to run more than once');
  assert.ok(log.list({source:'api'}).length>5);
});

test('helpers: bbox parsing and line simplification',()=>{
  assert.deepEqual(parseBbox('1,2,3,4'),{w:1,s:2,e:3,n:4});
  assert.throws(()=>parseBbox('1,2,3'));
  assert.equal(simplify([[0,0],[1,0.0000001],[2,0]],0.001).length,2);
});

test('calendar API extrapolates weekly GTFS service and applies holiday/exception rules',t=>{
  const {root,store}=project(t,{world:true});
  const db=new DatabaseSync(path.join(root,'data/trainsim.sqlite'));
  db.exec(`INSERT INTO translink_feed VALUES(1,'test','2026-10-25T00:00:00Z','abc','20261024','20261223','test');
    INSERT INTO translink_route VALUES('rail-route','T1','Central - North',NULL,2,NULL,NULL,NULL);
    INSERT INTO translink_service VALUES('sunday',0,0,0,0,0,0,1,'20261024','20261223');
    INSERT INTO translink_stop VALUES('central',NULL,'Central',-27.47,153.02,NULL,NULL);
    INSERT INTO translink_stop VALUES('mid',NULL,'Mid',-27.46,153.02,NULL,NULL);
    INSERT INTO translink_stop VALUES('north',NULL,'North',-27.45,153.02,NULL,NULL);
    INSERT INTO translink_trip VALUES('trip-1','rail-route','sunday','North',0,'shape-1','QR-EMU-01');
    INSERT INTO translink_stop_time VALUES('trip-1',1,'central',25200,25200);
    INSERT INTO translink_stop_time VALUES('trip-1',2,'mid',26400,27600);
    INSERT INTO translink_stop_time VALUES('trip-1',3,'north',28800,28800);
    INSERT INTO translink_shape_point VALUES('shape-1',1,-27.47,153.02);
    INSERT INTO translink_shape_point VALUES('shape-1',2,-27.46,153.02);
    INSERT INTO translink_shape_point VALUES('shape-1',3,-27.45,153.02);
    INSERT INTO sim_public_holiday VALUES('2026-10-05','King''s Birthday','Queensland','full-day',NULL,NULL,'test');`);
  db.close();
  const map=new MapApi(store,root);
  assert.equal(map.calendarStatus().available,true);
  const holiday=map.calendar({date:'2026-10-05',time:'27000'});
  assert.equal(holiday.holidays[0].name,"King's Birthday");
  assert.equal(holiday.trains.length,1);
  assert.equal(holiday.trains[0].engineId,'QR-EMU-01');
  assert.equal(holiday.trains[0].serviceName,'Central - North');
  assert.equal(holiday.trains[0].serviceDate,'2026-10-05');
  assert.equal(holiday.trains[0].startStation,'Central');
  assert.equal(holiday.trains[0].startSeconds,25200);
  assert.equal(holiday.trains[0].endStation,'North');
  assert.equal(holiday.trains[0].endSeconds,28800);
  assert.equal(holiday.trains[0].nextStop,'North');
  assert.ok(Math.abs(holiday.trains[0].position.lat+27.46)<0.00001,
    'trains remain at a scheduled intermediate stop during dwell time');
  assert.ok(holiday.trains[0].bearing<1||holiday.trains[0].bearing>359);

  const edit=new DatabaseSync(path.join(root,'data/trainsim.sqlite'));
  edit.prepare('INSERT INTO translink_service_date VALUES(?, ?, ?)').run('sunday','2026-10-05',2);
  edit.prepare('INSERT INTO translink_service_date VALUES(?, ?, ?)').run('sunday','2026-10-26',1);
  edit.close();
  assert.equal(map.calendar({date:'2026-10-05',time:'27000'}).trains.length,0,
    'a feed removal exception overrides the holiday Sunday pattern');
  assert.equal(map.calendar({date:'2026-10-26',time:'27000'}).trains.length,1,
    'an explicit added service runs outside the published feed period');
  assert.throws(()=>map.calendar({date:'2026-02-30',time:'0'}),/valid YYYY-MM-DD/);
  assert.throws(()=>map.calendar({date:'2026-10-05',time:'86400'}),/whole seconds/);
});

test('API rejects non-loopback clients',async t=>{
  const {root,log}=project(t);
  const app=createApp({root,log});
  const server=app.listen(0,'127.0.0.1');
  t.after(()=>server.close());
  await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const ok=await (await fetch(base+'/api/db/databases')).json();
  assert.ok(ok.databases.some(d=>d.id==='data/esig/demo.sqlite'));
  const remote=createApp({root,log});
  const req={socket:{remoteAddress:'10.0.0.5'}};
  let status=0;
  remote.handle({...req,method:'GET',url:'/api/health',headers:{}},{status(s){status=s;return this;},json(){},set(){return this;},setHeader(){},getHeader(){},end(){}},()=>{});
  assert.equal(status,403);
});
