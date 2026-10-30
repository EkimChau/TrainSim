import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {CORPUS_DB,ingestFunctionalData,readFunctionalCatalogue} from '../server/functional-ingest.js';
import {DbConsole} from '../server/db/console.js';

const ROOT=path.resolve(import.meta.dirname,'..');
function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-functional-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const rel of ['docs','data/esig/catalog','data/esig/examples'])fs.cpSync(path.join(ROOT,rel),path.join(root,rel),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'readme.md'),path.join(root,'readme.md'));
  return root;
}
const count=(db,table)=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

test('populates normalized functional data, provenance and synthetic GA/SA without fabricating extraction',t=>{
  const root=project(t),c=ingestFunctionalData(root);
  const db=new DatabaseSync(path.join(root,CORPUS_DB));t.after(()=>db.close());
  assert.equal(count(db,'functional_module'),7);
  assert.equal(count(db,'functional_function'),1);
  assert.equal(count(db,'functional_requirement'),1);
  assert.equal(count(db,'source_volume_expectation'),9);
  assert.equal(count(db,'application_level'),6);
  assert.equal(count(db,'network_config'),1);
  assert.equal(count(db,'scenario'),1);
  assert.equal(count(db,'functional_document'),c.documents.length);
  for(const table of ['document','source_page','clause','classification_row','rule','sim_run','verdict'])assert.equal(count(db,table),0,table);
  const req=db.prepare('SELECT * FROM functional_requirement').get();
  assert.match(req.expected_clause_id,/5\.10\.3\.2\.3:1$/);
  assert.equal(req.resolved_clause_id,null);
  assert.equal(c.storage.extraction.missingSources.length,9);
  assert.equal(c.storage.extraction.expectedPages,848);
  assert.equal(c.storage.extraction.counts.source_page,0);
  assert.equal(readFunctionalCatalogue(root).hash,c.hash);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const row=db.prepare('SELECT sha256 FROM functional_source WHERE kind=?').get('function');
  assert.match(row.sha256,/^[0-9a-f]{64}$/);
});

test('imports are idempotent and later file changes require explicit ingestion',t=>{
  const root=project(t),first=ingestFunctionalData(root);
  const second=ingestFunctionalData(root);assert.equal(first.hash,second.hash);
  new DbConsole(root,{record(){}}).tables(CORPUS_DB);
  assert.equal(ingestFunctionalData(root).hash,second.hash,'browsing the database must not prevent idempotent imports');
  fs.appendFileSync(path.join(root,'readme.md'),'\nNew persisted content');
  assert.equal(readFunctionalCatalogue(root).hash,second.hash);
  const third=ingestFunctionalData(root);assert.notEqual(third.hash,second.hash);
  const db=new DatabaseSync(path.join(root,CORPUS_DB));t.after(()=>db.close());
  assert.equal(count(db,'scenario'),1);assert.equal(count(db,'functional_function'),1);
});

test('rolls back the entire import rather than overwriting a reviewed scenario',t=>{
  const root=project(t),initial=ingestFunctionalData(root);
  const db=new DatabaseSync(path.join(root,CORPUS_DB));t.after(()=>db.close());
  db.exec("UPDATE scenario SET review_state='reviewed'");
  fs.appendFileSync(path.join(root,'readme.md'),'\nMust roll back');
  assert.throws(()=>ingestFunctionalData(root),/Cannot overwrite reviewed scenario/);
  assert.equal(readFunctionalCatalogue(root).hash,initial.hash);
  assert.equal(db.prepare('SELECT content FROM functional_document WHERE source_path=?').get('readme.md').content.includes('Must roll back'),false);
  assert.equal(count(db,'functional_function'),1);
});
