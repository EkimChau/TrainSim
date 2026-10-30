import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export const GEOGRAPHY_DB='data/corpus/geography.sqlite';
export const LEGACY_GEOGRAPHY_DB='data/trainsim.sqlite';

/** Move the source database, retaining its rows, SQLite sidecar state and runtime provenance. */
export function moveGeographyInput(root){
  const oldFile=path.join(root,LEGACY_GEOGRAPHY_DB),newFile=path.join(root,GEOGRAPHY_DB);
  if(!fs.existsSync(oldFile))return {moved:false,database:GEOGRAPHY_DB,present:fs.existsSync(newFile)};
  if(fs.existsSync(newFile))throw new Error('Both geography database locations exist; migration cannot overwrite either file');
  const source=new DatabaseSync(oldFile,{timeout:5000});
  try{
    const tables=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name));
    if(!tables.has('rail_track')||tables.has('simworld_meta')||tables.has('technical_reference'))throw new Error('Legacy file is not a geography/timetable corpus input');
    if(source.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||source.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Geography input integrity check failed; original file retained');
    const checkpoint=source.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if(checkpoint.busy)throw new Error('Geography database is busy; stop its importer and retry migration');
  }finally{source.close();}
  fs.mkdirSync(path.dirname(newFile),{recursive:true});
  const moved=[];
  try{
    for(const suffix of ['','-wal','-shm'])if(fs.existsSync(oldFile+suffix)){fs.renameSync(oldFile+suffix,newFile+suffix);moved.push(suffix);}
    const worldFile=path.join(root,'data/simworld/simworld.sqlite');
    if(fs.existsSync(worldFile)){
      const world=new DatabaseSync(worldFile,{timeout:5000});
      try{
        if(world.prepare("SELECT 1 FROM sqlite_master WHERE name='simworld_source'").get()){
          const record=world.prepare('SELECT details_json FROM simworld_source WHERE source_path=?').get(LEGACY_GEOGRAPHY_DB);
          if(record){
            const details={...JSON.parse(record.details_json),inputRole:'corpus_geography_and_timetable',relocatedFrom:LEGACY_GEOGRAPHY_DB,relocatedAt:new Date().toISOString()};
            world.prepare('UPDATE simworld_source SET source_path=?,details_json=? WHERE source_path=?').run(GEOGRAPHY_DB,JSON.stringify(details),LEGACY_GEOGRAPHY_DB);
          }
        }
      }finally{world.close();}
    }
  }catch(error){for(const suffix of moved.reverse())fs.renameSync(newFile+suffix,oldFile+suffix);throw error;}
  return {moved:true,from:LEGACY_GEOGRAPHY_DB,database:GEOGRAPHY_DB,classification:'corpus_input'};
}
