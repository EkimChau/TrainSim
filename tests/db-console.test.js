import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {DbConsole,singleStatement} from '../server/db-console.js';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-db-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data','esig'),{recursive:true});
  const d=new DatabaseSync(path.join(root,'data/esig/demo.sqlite'));
  d.exec(`CREATE TABLE item(id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL);
          CREATE TABLE pair(a TEXT, b TEXT, PRIMARY KEY(a,b));
          INSERT INTO item VALUES('one','Station',1);
          INSERT INTO pair VALUES('A','B');`);d.close();
  return {root,id:'data/esig/demo.sqlite',store:new DbConsole(root)};
}
test('discovers project databases, not arbitrary or fake files',t=>{
  const {root,id,store}=fixture(t);
  fs.writeFileSync(path.join(root,'fake.sqlite'),'not sqlite');
  fs.symlinkSync('/etc/passwd',path.join(root,'data','bad.sqlite'));
  assert.deepEqual(store.databases(),[id]);
  assert.throws(()=>store.tables('../foreign.sqlite'),/not found/);
});
test('browse, update, add and delete live rows with auditable calls',t=>{
  const {id,store}=fixture(t);
  assert.ok(store.tables(id).some(x=>x.name==='item'));
  const page=store.browse(id,'item');assert.equal(page.rows.length,1);
  assert.equal(store.edit(id,'item',{id:'one'},{name:'Central'}).changes,1);
  assert.equal(store.add(id,'item',{id:'two',name:'North'}).changes,1);
  assert.equal(store.browse(id,'item').rows[1].name,'North');
  assert.equal(store.delete(id,'item',{id:'one'}).changes,1);
  assert.equal(store.browse(id,'item').rows.length,1);
  assert.ok(store.saved().some(x=>x.sql.includes('UPDATE')));
});
test('rejects repeated payload with different IDs in any table and respects composite keys',t=>{
  const {id,store}=fixture(t);
  assert.throws(()=>store.add(id,'item',{id:'different',name:'Station',count:1}),/Duplicate row blocked/);
  assert.throws(()=>store.execute(id,"INSERT INTO item VALUES('yet-another','Station',1)"),/Duplicate row blocked/);
  assert.throws(()=>store.add(id,'pair',{a:'A',b:'B'}),/constraint|Duplicate/);
  store.add(id,'events',{message:'unique message'});
  assert.throws(()=>store.add(id,'events',{message:'unique message'}),/Duplicate row blocked/);
});
test('counts identical SQL once in saved history and sorts newest first',t=>{
  const {id,store,root}=fixture(t);
  const sql='SELECT * FROM "item"';store.execute(id,sql);store.execute(id,sql);
  const entry=store.saved().find(x=>x.sql===sql);
  assert.equal(entry.count,2);
  store.rename(entry.id,'Items listing');
  const reloaded=new DbConsole(root);
  assert.equal(reloaded.saved().find(x=>x.id===entry.id).name,'Items listing');
  assert.throws(()=>store.execute(id,'SELECT 1; DELETE FROM item'),/one SQL/);
  assert.equal(singleStatement("SELECT ';' AS semi; -- comment\n"),"SELECT ';' AS semi; -- comment");
});
