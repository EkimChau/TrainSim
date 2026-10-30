import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {moveGeographyInput,GEOGRAPHY_DB,LEGACY_GEOGRAPHY_DB} from '../server/geography.js';

const ROOT=path.resolve(import.meta.dirname,'..');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-geography-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  const db=new DatabaseSync(path.join(root,LEGACY_GEOGRAPHY_DB));
  db.exec(fs.readFileSync(path.join(ROOT,'db/corpus/geography-schema.sql'),'utf8'));db.close();
  return root;
}

test('relocates the geography input without changing data and preserves SimWorld provenance',t=>{
  const root=project(t),before=hash(path.join(root,LEGACY_GEOGRAPHY_DB));
  fs.mkdirSync(path.join(root,'data/simworld'),{recursive:true});
  const file=path.join(root,'data/simworld/simworld.sqlite'),world=new DatabaseSync(file);
  world.exec(fs.readFileSync(path.join(ROOT,'db/simworld/schema.sql'),'utf8'));
  world.prepare('INSERT INTO simworld_source VALUES(?,?,?,?,?,?)').run('world-input','geography_and_timetable',LEGACY_GEOGRAPHY_DB,before,'2026-10-31T00:00:00Z','{}');world.close();
  assert.equal(moveGeographyInput(root).moved,true);
  assert.equal(fs.existsSync(path.join(root,LEGACY_GEOGRAPHY_DB)),false);
  assert.equal(hash(path.join(root,GEOGRAPHY_DB)),before);
  const db=new DatabaseSync(file,{readOnly:true});t.after(()=>db.close());
  const row=db.prepare('SELECT * FROM simworld_source').get();
  assert.equal(row.source_path,GEOGRAPHY_DB);assert.equal(row.fingerprint,before);
  assert.equal(JSON.parse(row.details_json).relocatedFrom,LEGACY_GEOGRAPHY_DB);
  assert.equal(moveGeographyInput(root).moved,false);
});

test('does not overwrite either file when both paths exist',t=>{
  const root=project(t),old=path.join(root,LEGACY_GEOGRAPHY_DB),next=path.join(root,GEOGRAPHY_DB);
  fs.mkdirSync(path.dirname(next),{recursive:true});fs.writeFileSync(next,'keep this file');
  const before=hash(old);
  assert.throws(()=>moveGeographyInput(root),/cannot overwrite/);
  assert.equal(hash(old),before);assert.equal(fs.readFileSync(next,'utf8'),'keep this file');
});

test('refuses to classify a runtime database as a geography corpus input',t=>{
  const root=project(t),old=path.join(root,LEGACY_GEOGRAPHY_DB),db=new DatabaseSync(old);
  db.exec('CREATE TABLE simworld_meta(key TEXT PRIMARY KEY,value TEXT)');db.close();
  assert.throws(()=>moveGeographyInput(root),/not a geography\/timetable corpus input/);
  assert.equal(fs.existsSync(old),true);assert.equal(fs.existsSync(path.join(root,GEOGRAPHY_DB)),false);
});
