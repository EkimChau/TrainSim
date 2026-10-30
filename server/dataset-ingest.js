import fs from 'node:fs';
import path from 'node:path';
import {corpusId} from './technical-ingest.js';
import {createHash} from 'node:crypto';

export function ingestDatasetReferences(db,root){
  const inventory='public/internet-specs/scenario-datasets.json';
  if(!fs.existsSync(path.join(root,inventory)))return {datasets:0,seedObjects:0,seedLinks:0};
  const data=JSON.parse(fs.readFileSync(path.join(root,inventory),'utf8'));
  for(const source of data.datasources){
    if(!source.id||!source.source_url||!source.licence)throw new Error('Invalid scenario dataset provenance');
    const id=corpusId('dataset',`${source.id}:${source.source_version??source.source_url}`);
    db.prepare('INSERT INTO corpus_dataset VALUES(?,?,?,?,?,?,?) ON CONFLICT(corpus_id) DO UPDATE SET metadata_json=excluded.metadata_json').run(id,source.id,source.title,source.source_url,source.source_version??null,source.licence,JSON.stringify(source));
  }
  for(const [filename,datasetId] of [['locking_table.json','OSMHPI-LOCKTABLE'],['geographical.json','OSMHPI-GEO']]){
    const rel=`public/internet-specs/dataset-seeds/osmhpi/${filename}`;
    if(!fs.existsSync(path.join(root,rel)))continue;
    const dataset=db.prepare('SELECT corpus_id FROM corpus_dataset WHERE dataset_id=?').get(datasetId);
    if(!dataset)throw new Error(`Missing seed dataset provenance: ${datasetId}`);
    const raw=fs.readFileSync(path.join(root,rel)),sha=createHash('sha256').update(raw).digest('hex');
    const seed=JSON.parse(raw),objects=[];
    for(const [kind,rows] of Object.entries(seed)){
      if(!Array.isArray(rows))throw new Error('Invalid seed object collection');
      for(const row of rows){
        if(typeof row.name!=='string')throw new Error('Seed object name is required');
        const id=corpusId('seed-object',`${dataset.corpus_id}:${kind}:${row.name}`);
        db.prepare('INSERT INTO corpus_seed_object VALUES(?,?,?,?,?,?,?) ON CONFLICT(corpus_id) DO UPDATE SET source_sha256=excluded.source_sha256,values_json=excluded.values_json').run(id,dataset.corpus_id,kind,row.name,rel,sha,JSON.stringify(row));
        objects.push({id,kind,name:row.name,row});
      }
    }
    for(const object of objects){
      db.prepare('DELETE FROM corpus_seed_link WHERE from_id=?').run(object.id);
      for(const [field,value] of Object.entries(object.row)){
        if(field==='name')continue;
        for(const [ordinal,target] of (Array.isArray(value)?value:[value]).entries()){
          if(typeof target!=='string')continue;
          const found=objects.filter(o=>o.name===target);
          if(!found.length&&!/(route|point|signal|zone|transit|link)/i.test(field))continue;
          db.prepare('INSERT INTO corpus_seed_link VALUES(?,?,?,?,?,?)').run(object.id,field,ordinal+1,found.length===1?found[0].id:null,target,found.length===1?'resolved':found.length?'ambiguous':'unresolved');
        }
      }
    }
  }
  return {datasets:db.prepare('SELECT count(*) n FROM corpus_dataset').get().n,seedObjects:db.prepare('SELECT count(*) n FROM corpus_seed_object').get().n,seedLinks:db.prepare('SELECT count(*) n FROM corpus_seed_link').get().n};
}
