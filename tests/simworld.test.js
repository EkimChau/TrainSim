import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {ingestFunctionalData,CORPUS_DB,readFunctionalCatalogue} from '../server/functional-ingest.js';
import {buildSimWorld,SIMWORLD_DB,simworldReady} from '../server/simworld.js';
import {DbConsole} from '../server/db/console.js';
import {MapApi} from '../server/map-api.js';
import {isolateOfficialSource} from '../server/isolate-sources.js';

const ROOT=path.resolve(import.meta.dirname,'..');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-isolation-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const rel of ['docs','data/esig/catalog','data/esig/examples','data/esig/contracts','public/internet-specs'])fs.cpSync(path.join(ROOT,rel),path.join(root,rel),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'readme.md'),path.join(root,'readme.md'));
  const source=new DatabaseSync(path.join(root,'data/trainsim.sqlite'));
  source.exec(fs.readFileSync(path.join(ROOT,'db/trainsim/schema.sql'),'utf8'));source.close();
  return root;
}

test('corpus and world are separate; runtime overrides survive reference publication',t=>{
  const root=project(t),input=path.join(root,'data/trainsim.sqlite');
  const inputHash=hash(input);
  ingestFunctionalData(root);const corpusHash=hash(path.join(root,CORPUS_DB));
  const result=buildSimWorld(root);
  assert.equal(result.classification,'fictitious');assert.equal(simworldReady(root),true);
  assert.equal(hash(input),inputHash);assert.equal(hash(path.join(root,CORPUS_DB)),corpusHash);
  const world=new DatabaseSync(path.join(root,SIMWORLD_DB));
  world.exec("UPDATE rail_emu_train SET carriage_count=6 WHERE train_id='QR-EMU-01'; UPDATE simworld_parameter SET value_json='true' WHERE name='valid_level_2_ma'; UPDATE simworld_seed_object SET values_json='{\"override\":true}' WHERE id=(SELECT id FROM simworld_seed_object LIMIT 1)");
  world.close();
  buildSimWorld(root);
  const db=new DatabaseSync(path.join(root,SIMWORLD_DB));t.after(()=>db.close());
  assert.equal(db.prepare("SELECT carriage_count FROM rail_emu_train WHERE train_id='QR-EMU-01'").get().carriage_count,6);
  assert.equal(db.prepare("SELECT value_json FROM simworld_parameter WHERE name='valid_level_2_ma'").get().value_json,'true');
  assert.equal(db.prepare("SELECT count(*) n FROM simworld_seed_object WHERE values_json='{\"override\":true}'").get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM corpus_dataset').get().n,18);
  assert.equal(db.prepare('SELECT count(*) n FROM simworld_seed_object').get().n,62);
  assert.equal(db.prepare('SELECT count(*) n FROM simworld_seed_link').get().n,205);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(hash(path.join(root,CORPUS_DB)),corpusHash);
  assert.equal(readFunctionalCatalogue(root,SIMWORLD_DB).storage.runtimeDatabase,SIMWORLD_DB);
});

test('runtime uses a pinned SimWorld snapshot even after corpus changes',t=>{
  const root=project(t);
  ingestFunctionalData(root);buildSimWorld(root);
  const initial=readFunctionalCatalogue(root,SIMWORLD_DB).hash;
  fs.appendFileSync(path.join(root,'readme.md'),'\nChanged reference input');
  ingestFunctionalData(root);
  assert.notEqual(readFunctionalCatalogue(root).hash,initial);
  assert.equal(readFunctionalCatalogue(root,SIMWORLD_DB).hash,initial);
  buildSimWorld(root);
  assert.equal(readFunctionalCatalogue(root,SIMWORLD_DB).hash,readFunctionalCatalogue(root).hash);
});

test('reference databases are read-only in data/query tools; runtime cannot target an input',t=>{
  const root=project(t);ingestFunctionalData(root);buildSimWorld(root);
  const console=new DbConsole(root,{record(){}});
  assert.throws(()=>console.execute(CORPUS_DB,"UPDATE functional_catalogue SET sha256='changed'"),/readonly|read.only/i);
  assert.throws(()=>console.execute('data/trainsim.sqlite','DELETE FROM rail_emu_train'),/readonly|read.only/i);
  assert.throws(()=>console.execute(SIMWORLD_DB,"/* comment */ ATTACH DATABASE 'other.sqlite' AS other"),/attachments/);
  assert.equal(console.browse(CORPUS_DB,'functional_function').readOnly,true);
  assert.equal(console.browse(SIMWORLD_DB,'rail_emu_train').readOnly,false);
  assert.equal(console.browse(SIMWORLD_DB,'functional_function').readOnly,true);
  assert.throws(()=>console.execute(SIMWORLD_DB,'DELETE FROM functional_function'),/read.only/i);
  assert.throws(()=>new MapApi(console,root,CORPUS_DB),/SimWorld/);
  assert.equal(new MapApi(console,root).id,SIMWORLD_DB);
});

test('legacy combined registry migrates to corpus before source-only cleanup with a backup',async t=>{
  const root=project(t),officialFile=path.join(root,'data/esig/esig.sqlite');
  const legacy=new DatabaseSync(officialFile);
  legacy.exec(fs.readFileSync(path.join(ROOT,'db/corpus/schema.sql'),'utf8'));
  legacy.prepare('INSERT INTO functional_module VALUES(?,?)').run('KeepLegacy','keep-legacy');legacy.close();
  const before=hash(officialFile);
  ingestFunctionalData(root);
  assert.equal(hash(officialFile),before,'corpus ingestion must not mutate official inputs');
  const result=await isolateOfficialSource(root);
  assert.equal(result.migrated,true);assert.equal(fs.existsSync(result.backup),true);
  const official=new DatabaseSync(officialFile,{readOnly:true}),corpus=new DatabaseSync(path.join(root,CORPUS_DB),{readOnly:true});
  t.after(()=>{official.close();corpus.close();});
  assert.equal(official.prepare("SELECT count(*) n FROM sqlite_master WHERE name='functional_module'").get().n,0);
  assert.equal(corpus.prepare("SELECT name FROM functional_module WHERE name='KeepLegacy'").get().name,'KeepLegacy');
  assert.equal(official.prepare('PRAGMA foreign_key_check').all().length,0);
});
