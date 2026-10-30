import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {DbConsole} from '../server/db/console.js';

function browser(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-browser-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const file of ['data/local/console.sqlite','data/simworld/simworld.sqlite','data/corpus/corpus.sqlite','data/corpus/geography.sqlite','data/esig/esig.sqlite','data/local/backups/snapshot.sqlite','data/current/rail.sqlite3']){
    const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});
    const db=new DatabaseSync(full);
    db.exec("CREATE TABLE schema_info(key TEXT PRIMARY KEY,value TEXT); INSERT INTO schema_info VALUES('natural_keys','all'); CREATE TABLE parent(id TEXT PRIMARY KEY); CREATE TABLE child(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL REFERENCES parent(id),name TEXT DEFAULT 'draft'); CREATE INDEX child_parent ON child(parent_id); CREATE VIEW child_names AS SELECT name FROM child;");
    db.close();
  }
  return new DbConsole(root,{record(){}});
}

test('database browser separates categories, official evidence and archive files',t=>{
  const store=browser(t),files=store.describe(),get=id=>files.find(f=>f.id===id);
  assert.equal(get('data/local/console.sqlite').category,'system');
  assert.equal(get('data/simworld/simworld.sqlite').category,'simworld');
  assert.equal(get('data/corpus/geography.sqlite').category,'corpus');
  assert.equal(get('data/corpus/corpus.sqlite').title,'Technical corpus');
  assert.equal(get('data/esig/esig.sqlite').title,'Official ETCS evidence');
  assert.equal(get('data/esig/esig.sqlite').readOnly,true);
  assert.equal(get('data/simworld/simworld.sqlite').readOnly,false);
  assert.equal(get('data/local/backups/snapshot.sqlite').archived,true);
  assert.equal(get('data/current/rail.sqlite3').archived,true);
  assert.ok(files.every(f=>f.bytes>0&&Number.isFinite(Date.parse(f.modified))));
});

test('schema browser returns declared columns, foreign keys, indexes and read-only access',t=>{
  const store=browser(t),id='data/corpus/corpus.sqlite';
  const info=store.schema(id,'child');
  assert.equal(info.readOnly,true);assert.deepEqual(info.pk,['id']);
  assert.equal(info.columns.find(c=>c.name==='parent_id').required,1);
  assert.equal(info.columns.find(c=>c.name==='name').defaultValue,"'draft'");
  assert.equal(info.foreignKeys[0].table,'parent');assert.equal(info.foreignKeys[0].from,'parent_id');
  assert.deepEqual(info.indexes.find(i=>i.name==='child_parent').columns,['parent_id']);
  assert.match(info.sql,/CREATE TABLE child/);
  assert.equal(store.schema('data/simworld/simworld.sqlite','child_names').readOnly,true);
  assert.equal(store.tables(id).find(t=>t.name==='child').readOnly,true);
  assert.throws(()=>store.schema(id,'missing'),/Unknown table/);
  assert.throws(()=>store.schema('../outside.sqlite','child'),/not found/);
});
