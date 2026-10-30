import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {attachReadOnly,copyTables,tableNames} from './sqlite-copy.js';
import {CORPUS_DB} from './functional-ingest.js';

export const SIMWORLD_DB='data/simworld/simworld.sqlite';
const digest=value=>createHash('sha256').update(value).digest('hex');
const schema=rel=>fs.readFileSync(new URL(rel,import.meta.url),'utf8');
export function simworldReady(root){
  const file=path.join(root,SIMWORLD_DB);if(!fs.existsSync(file))return false;
  let db;
  try{db=new DatabaseSync(file,{readOnly:true});return db.prepare("SELECT value FROM simworld_meta WHERE key='classification'").get()?.value==='fictitious';}
  catch{return false;}finally{db?.close();}
}

/** Publish pinned source/corpus snapshots; never read corpus during a simulation step. */
export function buildSimWorld(root){
  const file=path.join(root,SIMWORLD_DB),exists=fs.existsSync(file);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const db=new DatabaseSync(file,{timeout:5000});
  const attached=[];
  try{
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(schema('../db/trainsim/schema.sql'));
    db.exec(schema('../db/corpus/schema.sql'));
    db.exec(schema('../db/simworld/schema.sql'));
    const corpus=path.join(root,CORPUS_DB),worldSource=path.join(root,'data/trainsim.sqlite');
    if(fs.existsSync(corpus)){attachReadOnly(db,corpus,'corpus');attached.push('corpus');}
    if(!exists&&fs.existsSync(worldSource)){attachReadOnly(db,worldSource,'world_input');attached.push('world_input');}
    db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON');
    try{
      for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'simworld_reference_guard_%'").all())db.exec(`DROP TRIGGER "${name}"`);
      const now=new Date().toISOString();
      if(attached.includes('world_input')){
        copyTables(db,'world_input',tableNames(db,'world_input'));
        db.prepare('INSERT OR REPLACE INTO simworld_source VALUES(?,?,?,?,?,?)').run('world-input','geography_and_timetable', 'data/trainsim.sqlite',digest(fs.readFileSync(worldSource)),now,JSON.stringify({classification:'fictitious',geometry:'derived_from_source_snapshot',operationalFidelity:'unverified'}));
      }
      if(attached.includes('corpus')){
        copyTables(db,'corpus',tableNames(db,'corpus'),{clear:true});
        const snapshot=db.prepare("SELECT payload_json FROM functional_catalogue WHERE id='current'").get();
        if(snapshot){
          const payload=JSON.parse(snapshot.payload_json);
          payload.storage={...payload.storage,runtimeDatabase:SIMWORLD_DB,classification:'fictitious',referenceSnapshot:true};
          db.prepare("UPDATE functional_catalogue SET payload_json=? WHERE id='current'").run(JSON.stringify(payload));
          db.prepare('INSERT OR REPLACE INTO simworld_source VALUES(?,?,?,?,?,?)').run('corpus-input','corpus_snapshot',CORPUS_DB,digest(fs.readFileSync(corpus)),now,JSON.stringify({parseId:payload.storage.technical.parseId,referenceMeaning:'source_reference_snapshot_not_runtime_truth'}));
        }
        for(const row of db.prepare('SELECT c.id,e.corpus_id FROM component_type c LEFT JOIN component_evidence e ON e.component_id=c.id ORDER BY c.id').all()){
          const id=`simworld:component:${row.id}`;
          db.prepare('INSERT INTO simworld_component VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET corpus_id=excluded.corpus_id').run(id,row.id,row.corpus_id??null,'fictitious',JSON.stringify({instance:'demonstration',parameters:{},readiness:'unreviewed'}));
        }
        for(const contract of db.prepare('SELECT * FROM component_io_function').all()){
          db.prepare('INSERT INTO simworld_contract VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET corpus_id=excluded.corpus_id').run(`simworld:contract:${contract.id}`,`simworld:component:${contract.component_id}`,contract.corpus_id,'{}','blocked_pending_review');
        }
        for(const value of db.prepare('SELECT v.*,s.source_path FROM scenario_initial_value v JOIN source_catalogue s ON json_extract(s.data_json,\'$.id\')=v.scenario_id').all())db.prepare('INSERT INTO simworld_parameter VALUES(?,?,?,?,?) ON CONFLICT(scenario_id,name) DO NOTHING').run(value.scenario_id,value.parameter_name,value.value_json,'fictitious',value.source_path);
        for(const object of db.prepare('SELECT * FROM corpus_seed_object').all())db.prepare('INSERT INTO simworld_seed_object VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(`simworld:seed:${object.corpus_id}`,object.dataset_corpus_id,object.kind,object.source_name,object.values_json,'fictitious');
        for(const link of db.prepare('SELECT * FROM corpus_seed_link').all())db.prepare('INSERT INTO simworld_seed_link VALUES(?,?,?,?,?,?) ON CONFLICT(from_id,field,ordinal) DO NOTHING').run(`simworld:seed:${link.from_id}`,link.field,link.ordinal,link.to_id?`simworld:seed:${link.to_id}`:null,link.raw_target,link.resolution);
      }
      for(const [key,value] of Object.entries({classification:'fictitious',runtime_database:SIMWORLD_DB,last_reference_build:now,corpus_database:CORPUS_DB}))db.prepare('INSERT INTO simworld_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
      if(attached.includes('corpus'))for(const table of tableNames(db,'corpus').filter(name=>name!=='schema_info')){
        for(const operation of ['INSERT','UPDATE','DELETE']){
          const name=`simworld_reference_guard_${digest(table).slice(0,16)}_${operation.toLowerCase()}`;
          db.exec(`CREATE TRIGGER "${name}" BEFORE ${operation} ON "${table.replaceAll('"','""')}" BEGIN SELECT RAISE(ABORT,'Reference snapshots are read-only; edit SimWorld instances and parameters'); END`);
        }
      }
      const errors=db.prepare('PRAGMA foreign_key_check').all();
      if(errors.length)throw new Error(`SimWorld has invalid reference links: ${JSON.stringify(errors.slice(0,3))}`);
      db.exec('COMMIT');
      return {database:SIMWORLD_DB,classification:'fictitious',components:db.prepare('SELECT count(*) n FROM simworld_component').get().n,contracts:db.prepare('SELECT count(*) n FROM simworld_contract').get().n};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{
    for(const alias of attached)db.exec(`DETACH DATABASE ${alias}`);
    db.close();
  }
}
