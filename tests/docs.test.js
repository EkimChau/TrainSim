import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {loadDocsCatalogue,loadRepositoryDocs,parseMetadata} from '../server/docs-catalogue.js';
import {documentLinks,docHref,readmeHref} from '../src/client/docs/markdown.js';
import {createApp} from '../server/app.js';
import {QueryLog} from '../server/db/query-log.js';
import {matchesRecord} from '../src/client/docs/view.js';

const ROOT=path.resolve(import.meta.dirname,'..');
const SOURCE='docs/sigreqs/sim-run/level-transitions/evaluate-level-entry-sig-subset-026-4-0-0-5-10-3-2-3.js';
const example=()=>parseMetadata(fs.readFileSync(path.join(ROOT,SOURCE),'utf8'));
function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-docs-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,path.dirname(SOURCE)),{recursive:true});
  fs.mkdirSync(path.join(root,'docs/sim'),{recursive:true});
  fs.writeFileSync(path.join(root,'docs/sim/guide.md'),'# Example guide\n\nA file-backed guide.');
  const write=(m,file=SOURCE)=>fs.writeFileSync(path.join(root,file),`export const metadata = ${JSON.stringify(m,null,2)};\n`);
  write(example());return {root,write};
}

test('ingests Markdown and JSON metadata without executing JavaScript, with deterministic hash',t=>{
  const {root}=project(t);
  fs.appendFileSync(path.join(root,SOURCE),'\nthrow new Error("must never execute");');
  const c=loadDocsCatalogue(root);
  assert.equal(c.documents[0].title,'Example guide');
  assert.equal(c.records.length,1);
  assert.equal(c.records[0].implementation.state,'not_implemented');
  assert.ok(c.warnings[0].messages.includes('Local ESIG registry unavailable; evidence not reconciled'));
  assert.equal(c.hash,loadDocsCatalogue(root).hash);
  fs.appendFileSync(path.join(root,'docs/sim/guide.md'),'\nChanged');
  assert.notEqual(c.hash,loadDocsCatalogue(root).hash);
});

test('rejects nonliteral metadata and invalid numeric JSON without evaluating source',t=>{
  assert.throws(()=>parseMetadata('export const metadata = (() => { throw 1; })()'),/JSON object literal/);
  assert.throws(()=>parseMetadata('export const metadata = {"x": process.env.HOME};'),/Invalid docs catalogue/);
  assert.throws(()=>parseMetadata('export const metadata = {} + process.env;'),/without expressions/);
  assert.throws(()=>parseMetadata('export const metadata = {"x": "unterminated'),/unterminated/);
  const {root}=project(t);
  fs.writeFileSync(path.join(root,SOURCE),'export const metadata = {"x":1e400};');
  assert.throws(()=>loadDocsCatalogue(root),/non-finite/);
});

test('validates filenames, fields, applicability, pointers and promotion gates',t=>{
  const {root,write}=project(t);
  for(const [mutate,pattern] of [
    [m=>m.functionSlug='other',/filename/],
    [m=>delete m.purpose,/purpose/],
    [m=>m.module='Other',/module/],
    [m=>m.status='GOLD',/status/],
    [m=>m.requirements[0].primary=false,/primary/],
    [m=>m.applicability.etcsLevels=['4'],/level/],
    [m=>m.requirements[0].clauseId='wrong',/occurrence/],
    [m=>m.implementation.path='../outside.js',/repository path/],
    [m=>m.acceptance[0].testPath='missing.js',/missing repository/],
    [m=>m.status='verified',/review identity/],
  ]){
    const m=example();mutate(m);write(m);assert.throws(()=>loadDocsCatalogue(root),pattern);
  }
});

test('validates graph references, reciprocal links, duplicate IDs and cycles',t=>{
  const {root,write}=project(t),a=example(),b=example();
  b.id='child';b.functionSlug='child';b.functionName='child';
  const child=SOURCE.replace('evaluate-level-entry-sig-','child-sig-');
  a.relationships.childrenIds=[b.id];b.relationships.parentId=a.id;
  write(a);write(b,child);
  assert.equal(loadDocsCatalogue(root).records.length,2);
  b.relationships.parentId=null;write(b,child);
  assert.throws(()=>loadDocsCatalogue(root),/reciprocal/);
  b.relationships.parentId=a.id;b.relationships.childrenIds=[a.id];a.relationships.parentId=b.id;
  write(a);write(b,child);assert.throws(()=>loadDocsCatalogue(root),/cycle/);
  a.relationships.parentId=null;b.relationships.childrenIds=[];a.relationships.dependsOnIds=['absent'];
  write(a);write(b,child);assert.throws(()=>loadDocsCatalogue(root),/unknown/);
  a.relationships.dependsOnIds=[];b.id=a.id;write(a);write(b,child);
  assert.throws(()=>loadDocsCatalogue(root),/duplicate record IDs/);
});

test('rejects symlinks instead of reading outside the documentation tree',t=>{
  const {root}=project(t);
  fs.symlinkSync(path.join(ROOT,'package.json'),path.join(root,'docs/escape.md'));
  assert.throws(()=>loadDocsCatalogue(root),/symlink/);
});

test('reviewed evidence must reconcile with the local registry, drafts show mismatches',t=>{
  const {root,write}=project(t),m=example(),r=m.requirements[0];
  m.status='reviewed';m.review={reviewedBy:'test-reviewer',reviewedAt:'2026-10-30T00:00:00Z',unresolved:[]};
  m.applicability={...m.applicability,reviewState:'reviewed',etcsModes:['UN'],etcsSystemVersions:['test-version']};
  Object.assign(r,{sourceSha256:'a'.repeat(64),startPage:1,endPage:2,classificationRowIds:['classification-1'],visualReview:'reviewed',classificationReview:'reviewed'});
  write(m);
  assert.throws(()=>loadDocsCatalogue(root),/registry unavailable/);
  fs.mkdirSync(path.join(root,'data/corpus'),{recursive:true});
  const db=new DatabaseSync(path.join(root,'data/corpus/corpus.sqlite'));
  db.exec('CREATE TABLE document(id TEXT,sha256 TEXT); CREATE TABLE clause(id TEXT,document_id TEXT,clause_no TEXT,start_page INTEGER,end_page INTEGER); CREATE TABLE classification_row(id TEXT,referenced_clause TEXT);');
  db.prepare('INSERT INTO document VALUES(?,?)').run(r.documentId,r.sourceSha256);
  db.prepare('INSERT INTO clause VALUES(?,?,?,?,?)').run(r.clauseId,r.documentId,r.clauseNo,1,2);
  db.prepare('INSERT INTO classification_row VALUES(?,?)').run('classification-1',r.clauseNo);
  db.close();
  assert.deepEqual(loadDocsCatalogue(root).warnings,[]);
  r.sourceSha256='b'.repeat(64);write(m);
  assert.throws(()=>loadDocsCatalogue(root),/Evidence mismatch/);
  m.status='draft';write(m);
  assert.match(loadDocsCatalogue(root).warnings[0].messages.join(),/Evidence mismatch/);
});

test('filters requirement metadata by module, source, level, mode, status and clause',()=>{
  const record=example();
  assert.equal(matchesRecord(record,{module:'SimRun',level:'2',issue:'4.0.0',status:'draft'},'5.10.3.2.3'),true);
  assert.equal(matchesRecord(record,{mode:'FS'},''),false);
  assert.equal(matchesRecord(record,{module:'SimWorld'},''),false);
  assert.equal(matchesRecord(record,{},'No such function'),false);
});

test('combines repository README, ESIG and simulation guides in one documentation catalogue',t=>{
  const {root}=project(t);
  fs.writeFileSync(path.join(root,'readme.md'),'# TrainSim\n\nRepository setup');
  fs.writeFileSync(path.join(root,'docs/development.md'),'# Development\n\nBuild the UI');
  fs.writeFileSync(path.join(root,'docs/esig-ingestion.md'),'# ESIG evidence');
  const sim=loadDocsCatalogue(root),repo=loadRepositoryDocs(root);
  assert.deepEqual(sim.documents.map(d=>d.id),['readme.md','docs/development.md','docs/esig-ingestion.md','docs/sim/guide.md']);
  assert.equal(sim.documents[0].category,'Repository');
  assert.deepEqual(repo.documents.map(d=>d.id),['readme.md','docs/development.md']);
  assert.equal(repo.documents[0].content,'# TrainSim\n\nRepository setup');
  assert.equal(sim.repositoryLinks[0].content,undefined);
  const links=documentLinks(sim.documents,sim.repositoryLinks);
  assert.equal(links.get('readme.md'),readmeHref('readme.md'));
  assert.equal(links.get('docs/sim/guide.md'),docHref('docs/sim/guide.md'));
  // Invalid requirement files must not break the repository README tab.
  fs.writeFileSync(path.join(root,SOURCE),'invalid');
  assert.equal(loadRepositoryDocs(root).documents.length,2);
});

test('ingests source manifests and synthetic scenarios, rejecting malformed data',t=>{
  const {root}=project(t);
  for(const dir of ['catalog','examples']){
    fs.mkdirSync(path.join(root,`data/esig/${dir}`),{recursive:true});
    for(const file of fs.readdirSync(path.join(ROOT,`data/esig/${dir}`)))fs.copyFileSync(path.join(ROOT,`data/esig/${dir}`,file),path.join(root,`data/esig/${dir}`,file));
  }
  const c=loadDocsCatalogue(root);
  assert.equal(c.datasets.length,3);
  assert.equal(c.datasets.find(d=>d.kind==='scenario').data.sa.stimuli.length,2);
  assert.equal(c.datasets.find(d=>d.data.volumes).data.volumes.length,9);
  assert.equal(Object.values(c.modules).length,7);
  const target=path.join(root,'data/esig/examples/mixed-l0-l2-no-ma.json');
  fs.writeFileSync(target,'{"id":"broken","ga":{},"sa":{}}');
  assert.throws(()=>loadDocsCatalogue(root),/initial state/);
  fs.writeFileSync(target,'not-json');
  assert.throws(()=>loadDocsCatalogue(root),/Invalid docs catalogue/);
});

test('docs API reads persisted data and explicitly ingests changes without publishing partial data',async t=>{
  const {root}=project(t);
  const log=new QueryLog(path.join(root,'console.sqlite'));
  t.after(()=>log.close());
  const server=createApp({root,log}).listen(0,'127.0.0.1');
  t.after(()=>server.close());
  await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/docs`;
  const first=await fetch(url);assert.equal(first.status,200);
  const data=await first.json();assert.equal(data.records.length,1);
  fs.appendFileSync(path.join(root,'docs/sim/guide.md'),'\nAPI reload');
  assert.equal((await (await fetch(url)).json()).hash,data.hash);
  assert.notEqual((await (await fetch(url+'/ingest',{method:'POST'})).json()).hash,data.hash);
  fs.writeFileSync(path.join(root,SOURCE),'export const metadata = {};');
  const invalid=await fetch(url+'/ingest',{method:'POST'});assert.equal(invalid.status,400);
  const body=await invalid.json();assert.match(body.error,/schemaVersion/);assert.equal(body.records,undefined);
  assert.equal((await (await fetch(url)).json()).records.length,1);
  const repo=await fetch(url.replace('/api/docs','/api/readme'));
  assert.equal(repo.status,200);assert.deepEqual((await repo.json()).documents,[]);
});
