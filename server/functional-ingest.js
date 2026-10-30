import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {loadDocsCatalogue} from './docs-catalogue.js';
import {populateTechnicalData} from './technical-ingest.js';
import {attachReadOnly,copyTables,tableNames,SOURCE_TABLES} from './sqlite-copy.js';
import {ingestDatasetReferences} from './dataset-ingest.js';

export const CORPUS_DB='data/corpus/corpus.sqlite';
const schema=new URL('../db/corpus/schema.sql',import.meta.url);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function open(root){
  const file=path.join(root,CORPUS_DB),existed=fs.existsSync(file);fs.mkdirSync(path.dirname(file),{recursive:true});
  const db=new DatabaseSync(file,{timeout:5000});
  try{
    db.exec('PRAGMA foreign_keys=ON');db.exec(fs.readFileSync(schema,'utf8'));
    const official=path.join(root,'data/esig/esig.sqlite');
    if(fs.existsSync(official)){
      attachReadOnly(db,official,'official');
      try{
        db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON');
        // One-time migration retains local records from the former combined store.
        if(!existed)copyTables(db,'official',tableNames(db,'official'));
        else{
          const source=tableNames(db,'official').filter(t=>SOURCE_TABLES.includes(t));
          for(const old of db.prepare('SELECT id,sha256 FROM document').all()){
            const next=db.prepare('SELECT sha256 FROM official.document WHERE id=?').get(old.id);
            if(!next||next.sha256!==old.sha256)throw new Error(`Cannot change the corpus source identity without a new corpus: ${old.id}`);
          }
          copyTables(db,'official',source,{clear:true});
        }
        if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Corpus source snapshot references are invalid');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      finally{db.exec('DETACH DATABASE official');}
    }
    return db;
  }
  catch(error){db.close();throw error;}
}
function prerequisiteStatus(root,db){
  const manifestPath=path.join(root,'data/esig/catalog/subset-026-4.0.0.json');
  const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
  const sourceDir='data/esig/sources/subset-026/4.0.0';
  const missingSources=[],mismatchedSources=[];
  for(const volume of manifest?.volumes??[]){
    const rel=`${sourceDir}/${volume.filename}`,full=path.join(root,rel);
    if(!fs.existsSync(full))missingSources.push(rel);
    else if(hash(fs.readFileSync(full))!==volume.sha256)mismatchedSources.push(rel);
  }
  const missingTools=['pdfinfo','pdftotext'].filter(tool=>!(process.env.PATH??'').split(path.delimiter).some(dir=>{try{fs.accessSync(path.join(dir,tool),fs.constants.X_OK);return true;}catch{return false;}}));
  const counts=Object.fromEntries(['document','source_page','clause','classification_row','source_artifact','protocol_element'].map(table=>[table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
  return {sourceDir,missingSources,mismatchedSources,missingTools,counts,expectedPages:manifest?.volumes.reduce((n,v)=>n+v.pages,0)??0,
    state:counts.source_page>0?'extracted_unverified':'awaiting_extraction'};
}

/** Atomically import authored contracts, catalogues and GA/SA; never create source evidence. */
export function ingestFunctionalData(root){
  // Validate before opening/creating the database so malformed input cannot publish a partial import.
  loadDocsCatalogue(root);
  const db=open(root);
  try{
    const catalogue=loadDocsCatalogue(root);
    const status=prerequisiteStatus(root,db);
    const importedAt=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      const source=db.prepare(`INSERT INTO functional_source VALUES(?,?,?,1) ON CONFLICT(source_path) DO UPDATE SET sha256=excluded.sha256,kind=excluded.kind,active=1`);
      db.exec('UPDATE functional_source SET active=0; UPDATE functional_function SET active=0');
      const addSource=(rel,kind)=>source.run(rel,hash(fs.readFileSync(path.join(root,rel))),kind);
      for(const [folder,name] of Object.entries(catalogue.modules))db.prepare('INSERT INTO functional_module VALUES(?,?) ON CONFLICT(name) DO UPDATE SET folder=excluded.folder').run(name,folder);
      for(const d of catalogue.documents){
        addSource(d.sourcePath,'markdown');
        db.prepare('INSERT INTO functional_document VALUES(?,?,?,?) ON CONFLICT(source_path) DO UPDATE SET title=excluded.title,category=excluded.category,content=excluded.content').run(d.sourcePath,d.title,d.category,d.content);
      }
      for(const m of catalogue.records){
        addSource(m.sourcePath,'function');
        db.prepare(`INSERT INTO functional_function VALUES(?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id,revision) DO UPDATE SET module=excluded.module,capability=excluded.capability,function_name=excluded.function_name,title=excluded.title,purpose=excluded.purpose,review_state=excluded.review_state,implementation_state=excluded.implementation_state,source_path=excluded.source_path,metadata_json=excluded.metadata_json,active=1`).run(m.id,m.revision,m.module,m.capability,m.functionName,m.title,m.purpose,m.status,m.implementation.state,m.sourcePath,JSON.stringify(m));
        db.prepare('DELETE FROM functional_requirement WHERE function_id=? AND function_revision=?').run(m.id,m.revision);
        for(const r of m.requirements){
          const resolved=db.prepare('SELECT id FROM clause WHERE id=?').get(r.clauseId)?.id??null;
          db.prepare('INSERT INTO functional_requirement VALUES(?,?,?,?,?,?,?,?)').run(m.id,m.revision,r.refcode,Number(r.primary),r.implementationRequirement,r.clauseId,resolved,JSON.stringify(r));
        }
      }
      const byId=new Map(catalogue.records.map(m=>[m.id,m]));
      for(const m of catalogue.records){
        db.prepare('DELETE FROM functional_relation WHERE from_id=? AND from_revision=?').run(m.id,m.revision);
        for(const [field,kind] of [['childrenIds','parent_of'],['dependsOnIds','depends_on'],['exceptionToIds','exception_to'],['supersedesIds','supersedes']])for(const id of m.relationships[field])db.prepare('INSERT INTO functional_relation VALUES(?,?,?,?,?)').run(m.id,m.revision,id,byId.get(id).revision,kind);
      }
      for(const d of catalogue.datasets){
        addSource(d.sourcePath,d.kind);
        db.prepare('INSERT INTO source_catalogue VALUES(?,?,?,?) ON CONFLICT(source_path) DO UPDATE SET title=excluded.title,kind=excluded.kind,data_json=excluded.data_json').run(d.sourcePath,d.title,d.kind,JSON.stringify(d.data));
        db.prepare('DELETE FROM source_volume_expectation WHERE catalogue_path=?').run(d.sourcePath);
        db.prepare('DELETE FROM application_level WHERE catalogue_path=?').run(d.sourcePath);
        for(const v of d.data.volumes??[])db.prepare('INSERT INTO source_volume_expectation VALUES(?,?,?,?,?,?,?)').run(d.sourcePath,`SUBSET-026-${v.chapter}@${d.data.issue}`,v.chapter,d.data.issue,v.filename,v.pages,v.sha256);
        for(const v of [...(d.data.defined_application_levels??[]),...(d.data.not_supported_as_new_level??[])])db.prepare('INSERT INTO application_level VALUES(?,?,?,?,?,?)').run(d.sourcePath,v.id,d.data.issue,v.name??null,v.source??null,v.status);
        if(d.kind==='scenario'){
          const data=d.data;
          for(const [table,id] of [['network_config',data.ga.id],['scenario',data.id]]){
            const old=db.prepare(`SELECT review_state FROM ${table} WHERE id=?`).get(id);
            if(old&&old.review_state!=='draft')throw new Error(`Cannot overwrite ${old.review_state} ${table}: ${id}`);
          }
          db.prepare(`INSERT INTO network_config VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,baseline=excluded.baseline,topology_json=excluded.topology_json,provenance_json=excluded.provenance_json`).run(data.ga.id,'1',data.standards.document_issue,JSON.stringify(data.ga),JSON.stringify({kind:'synthetic_fixture',sourcePath:d.sourcePath,sha256:hash(fs.readFileSync(path.join(root,d.sourcePath)))}),'draft');
          db.prepare(`INSERT INTO scenario VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET network_id=excluded.network_id,source_type=excluded.source_type,initial_json=excluded.initial_json,events_json=excluded.events_json,expected_json=excluded.expected_json`).run(data.id,data.ga.id,'synthetic_example',JSON.stringify(data.sa.initial),JSON.stringify(data.sa.stimuli),JSON.stringify(data.sa.assertions),'draft');
        }
      }
      const technical=populateTechnicalData(db,root,catalogue);
      const datasets=ingestDatasetReferences(db,root);
      const storage={database:CORPUS_DB,sourceDatabase:'data/esig/esig.sqlite',importedAt,extraction:status,technical,datasets};
      const payload={...catalogue,storage};
      db.prepare(`INSERT INTO functional_catalogue VALUES('current',?,?,?) ON CONFLICT(id) DO UPDATE SET sha256=excluded.sha256,imported_utc=excluded.imported_utc,payload_json=excluded.payload_json`).run(catalogue.hash,importedAt,JSON.stringify(payload));
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Functional import foreign-key check failed');
      db.exec('COMMIT');return payload;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}

export function readFunctionalCatalogue(root,database=CORPUS_DB){
  const file=path.join(root,database);
  if(!fs.existsSync(file))return null;
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='functional_catalogue'").get())return null;
    const row=db.prepare("SELECT payload_json FROM functional_catalogue WHERE id='current'").get();
    return row?JSON.parse(row.payload_json):null;
  }finally{db.close();}
}
