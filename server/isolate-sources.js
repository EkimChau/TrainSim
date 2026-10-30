import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {CORPUS_DB} from './functional-ingest.js';
import {SOURCE_TABLES,tableNames,quote} from './sqlite-copy.js';

/** One-time migration: local corpus rows leave the official source registry only after copying. */
export async function isolateOfficialSource(root){
  const file=path.join(root,'data/esig/esig.sqlite');
  if(!fs.existsSync(file))return {migrated:false};
  const source=new DatabaseSync(file),corpus=new DatabaseSync(path.join(root,CORPUS_DB),{readOnly:true});
  try{
    const extras=tableNames(source).filter(t=>!SOURCE_TABLES.includes(t));
    if(!extras.length)return {migrated:false};
    const known=new Set(tableNames(corpus));
    const views=source.prepare("SELECT name FROM sqlite_master WHERE type='view'").all();
    const copiedViews=new Set(corpus.prepare("SELECT name FROM sqlite_master WHERE type='view'").all().map(v=>v.name));
    for(const view of views)if(!copiedViews.has(view.name))throw new Error(`Cannot preserve unknown source view without a migration: ${view.name}`);
    for(const table of extras){
      if(!known.has(table))throw new Error(`Cannot isolate unknown source table: ${table}`);
      const before=source.prepare(`SELECT count(*) n FROM ${quote(table)}`).get().n;
      const copied=corpus.prepare(`SELECT count(*) n FROM ${quote(table)}`).get().n;
      if(copied<before)throw new Error(`Corpus migration is incomplete for ${table}`);
    }
    for(const doc of source.prepare('SELECT id,sha256 FROM document').all())if(corpus.prepare('SELECT sha256 FROM document WHERE id=?').get(doc.id)?.sha256!==doc.sha256)throw new Error('Corpus source identity does not match official evidence');
    const backupFile=path.join(root,`data/local/backups/esig-before-isolation-${Date.now()}.sqlite`);
    fs.mkdirSync(path.dirname(backupFile),{recursive:true});await backup(source,backupFile);
    source.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try{
      for(const {name} of source.prepare("SELECT name FROM sqlite_master WHERE type='view'").all())source.exec(`DROP VIEW ${quote(name)}`);
      for(const table of extras)source.exec(`DROP TABLE ${quote(table)}`);
      source.exec('COMMIT; PRAGMA foreign_keys=ON');
      if(source.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Official source references failed verification');
    }catch(error){if(source.isTransaction)source.exec('ROLLBACK');throw error;}
    return {migrated:true,backup:backupFile,removedLocalTables:extras.length};
  }finally{source.close();corpus.close();}
}
