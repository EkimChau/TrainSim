import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {parseVariable,parseProtocolFields,clauseReferences,corpusId} from '../server/technical-ingest.js';
import {ingestFunctionalData,CORPUS_DB} from '../server/functional-ingest.js';
import {technicalData as queryTechnical} from '../server/technical-api.js';

const technicalData=(root,query)=>queryTechnical(root,query,CORPUS_DB);
const ROOT=path.resolve(import.meta.dirname,'..');
const variableText='Q_SCALE\nName                      Qualifier for distance scale\nDescription               Source definition\nLength of variable        Minimum Value               Maximum Value                 Resolution/formula\n2 bits\nSpecial/Reserved Values   0                           10 cm scale\n                          1                           1 m scale\n                          2                           10 m scale\n                          3                           Spare';

test('extracts source widths, bounds and value codes without treating encoded levels as application levels',()=>{
  const parsed=parseVariable(variableText);
  assert.equal(parsed.bitLength,2);assert.equal(parsed.minimum,null);
  assert.deepEqual(parsed.values.map(v=>[v.code,v.meaning]),[['0','10 cm scale'],['1','1 m scale'],['2','10 m scale'],['3','Spare']]);
  const n=parseVariable('N_ITER\nLength of variable        Minimum Value               Maximum Value                 Resolution/formula\n5 bits                    0                           31                            integers');
  assert.equal(n.minimum,'0');assert.equal(n.maximum,'31');assert.equal(n.resolution,'integers');
});

test('keeps packet iterations and dynamic widths, repairs known wrapped variable names',()=>{
  const fields=parseProtocolFields('Packet Number 15\n L_SECTION(k)             15   if Q_TIMER\n TEXT                      8*L_TEXT\n', 'packet',new Set(['L_SECTION','TEXT']));
  assert.equal(fields[0].name,'L_SECTION(k)');assert.equal(fields[0].variable,'L_SECTION');
  assert.equal(fields[1].bitLength,null);assert.match(fields[1].raw,/8\*L_TEXT/);
  const message=parseProtocolFields('Message 132\n1 NID_MESSAGE\n2 Q_MARQSTREAS\n       ON\n3 Packet 0 or 1\n4 Optional packets','radio_message',new Set(['NID_MESSAGE','Q_MARQSTREASON']));
  assert.equal(message[1].variable,'Q_MARQSTREASON');assert.equal(message[2].variable,null);
});

test('corpus IDs occupy a local namespace; source references retain official numbers and offsets',()=>{
  assert.match(corpusId('variable','source-key'),/^corpus-id:variable:[a-f0-9]{64}$/);
  assert.equal(corpusId('variable','source-key'),corpusId('variable','source-key'));
  assert.notEqual(corpusId('variable','source-key'),corpusId('variable','other-issue'));
  const text='SRS issue 4.0.0: see clause 3.4.5 and 7.5.1.1. Limit 1.25 km.';
  assert.deepEqual(clauseReferences(text).map(r=>r.number),['3.4.5','7.5.1.1']);
});

function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-technical-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const rel of ['docs','data/esig/catalog','data/esig/examples','data/esig/contracts'])fs.cpSync(path.join(ROOT,rel),path.join(root,rel),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'readme.md'),path.join(root,'readme.md'));
  ingestFunctionalData(root);
  const db=new DatabaseSync(path.join(root,CORPUS_DB));
  for(const chapter of [2,5,7,8]){
    const doc=`SUBSET-026-${chapter}@4.0.0`;
    db.prepare('INSERT INTO document VALUES(?,?,?,?,?,?,?,?,?,?)').run(doc,`SUBSET-026-${chapter}`,'4.0.0',chapter,'Synthetic test','2023-07-05','test.pdf','a'.repeat(64),1,'fixture');
    db.prepare('INSERT INTO source_page VALUES(?,?,?,?,?)').run(doc,1,'synthetic source','b'.repeat(64),1);
  }
  const add=(number,body)=>{
    const doc=`SUBSET-026-${number.split('.')[0]}@4.0.0`,id=`${doc}:${number}:1`;
    db.prepare('INSERT INTO clause(id,document_id,clause_no,start_page,end_page,source_text) VALUES(?,?,?,?,?,?)').run(id,doc,number,1,1,body);return id;
  };
  for(const number of ['2.5.1.1','2.5.2.2.1','2.5.1.5.1'])add(number,'Component definition from fixture');
  add('8.6','Train to track');add('8.7','Track to train');
  add('5.10.3.2.3','See 7.5.1.1 and SUBSET-037; ambiguous 3.4.1');
  const v=add('7.5.1.1',variableText),msg=add('8.7.2','Message 3: Movement Authority\n1 NID_MESSAGE\n2 Q_SCALE\n3 Packet 15\n4 Optional packets'),packet=add('7.4.2.4','Packet Number 15: Level 2 MA\n Q_SCALE      2\n L_SECTION(k)      15');
  for(const [id,kind,name,no,raw] of [[v,'variable','Q_SCALE',null,variableText],[msg,'radio_message','Message 3: Movement Authority',3,'Message 3: Movement Authority\n1 NID_MESSAGE\n2 Q_SCALE\n3 Packet 15\n4 Optional packets'],[packet,'packet','Packet Number 15: Level 2 MA',15,'Packet Number 15: Level 2 MA\n Q_SCALE      2\n L_SECTION(k)      15']])db.prepare('INSERT INTO protocol_element(id,document_id,clause_id,element_kind,official_name,element_no,raw_definition) VALUES(?,?,?,?,?,?,?)').run(id+':structured',`SUBSET-026-${id.includes('-7@')?7:8}@4.0.0`,id,kind,name,no,raw);
  db.close();return root;
}

test('persists I/O contracts and parameters with standard/version/hash/page lineage and separate corpus IDs',t=>{
  const root=project(t),c=ingestFunctionalData(root);
  assert.equal(c.storage.technical.component_io_function,2);
  const db=new DatabaseSync(path.join(root,CORPUS_DB));t.after(()=>db.close());
  const functions=db.prepare('SELECT * FROM component_io_function').all();
  assert.ok(functions.every(f=>f.id.startsWith('corpus-id:')&&f.corpus_id===f.id));
  const detail=technicalData(root,{corpusId:functions[0].corpus_id});
  assert.equal(detail.reference.standard,'SUBSET-026');assert.equal(detail.reference.standard_issue,'4.0.0');
  assert.equal(detail.reference.source_sha256,'a'.repeat(64));assert.equal(detail.reference.start_page,1);
  assert.match(detail.reference.parser_sha256,/^[a-f0-9]{64}$/);
  assert.match(detail.reference.parse_id,/^corpus-id:parse:/);
  assert.equal(detail.parameters.length,4);
  const param=detail.parameters.find(p=>p.name==='Q_SCALE');
  assert.match(param.corpus_id,/^corpus-id:io-parameter:/);assert.equal(param.variable_clause_id,'SUBSET-026-7@4.0.0:7.5.1.1:1');
  assert.equal(param.variable_standard_issue,'4.0.0');
  const paramDetail=technicalData(root,{corpusId:param.corpus_id});
  assert.equal(paramDetail.parameter.function_id,detail.contract.id);
  assert.equal(paramDetail.reference.standard,'SUBSET-026');
  assert.equal(technicalData(root,{corpusId:param.variable_corpus_id}).values.length,4);
  assert.equal(db.prepare('SELECT resolution FROM protocol_packet_reference').get().resolution,'resolved');
  assert.equal(db.prepare('SELECT document_label,resolution FROM technical_external_reference').get().resolution,'source_not_ingested');
  const external=db.prepare('SELECT id FROM technical_external_reference').get();
  const externalDetail=technicalData(root,{corpusId:external.id});
  assert.equal(externalDetail.reference.standard,'SUBSET-026');
  assert.equal(externalDetail.externalReference.referencedStandard,'SUBSET-037');
  assert.equal(externalDetail.externalReference.referencedStandardIssue,null);
  assert.equal(db.prepare('SELECT count(*) n FROM technical_reference WHERE corpus_id NOT LIKE ?').get('corpus-id:%').n,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const first=functions.map(f=>f.id).sort();ingestFunctionalData(root);
  assert.deepEqual(db.prepare('SELECT id FROM component_io_function').all().map(f=>f.id).sort(),first);
});
