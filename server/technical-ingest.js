import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const HEADER=/^(?:4\.0\.0\s+Chapter|05\/07\/2023|ERA\s*\*\s*UNISIG|SUBSET-026-)/;
const linesOf=text=>text.split('\n').filter(line=>!HEADER.test(line.trim()));
const unique=values=>[...new Set(values)];
export const corpusId=(kind,identity)=>`corpus-id:${kind}:${createHash('sha256').update(identity).digest('hex')}`;

export function parseVariable(text){
  const lines=linesOf(text),header=lines.findIndex(l=>l.includes('Length of variable'));
  const widthLine=lines.slice(header+1).find(l=>/^\s*\d+\s+bits?\b/.test(l));
  const width=widthLine?.match(/^\s*(\d+)\s+bits?\b/);
  const layout=lines[header]??'';
  const min=layout.indexOf('Minimum Value'),max=layout.indexOf('Maximum Value'),res=layout.indexOf('Resolution');
  const cell=(start,end)=>start>=0&&widthLine?widthLine.slice(start,end).trim()||null:null;
  const values=[];let specials=false;
  for(const line of lines){
    if(line.includes('Special/Reserved Values'))specials=true;
    if(!specials)continue;
    const row=line.replace('Special/Reserved Values','').trim();
    const cells=row.split(/\s{2,}/);
    if(cells.length>=2&&/^[0-9Xx. …–\-]+$/.test(cells[0])&&/\d/.test(cells[0]))values.push({code:cells[0],meaning:cells.slice(1).join(' '),raw:line});
    else if(row&&values.length){values.at(-1).meaning+=' '+row;values.at(-1).raw+='\n'+line;}
  }
  return {bitLength:width?Number(width[1]):null,lengthRaw:width?.[0]?.trim()??null,
    minimum:cell(min,max),maximum:cell(max,res),resolution:cell(res),
    description:lines.slice(1,header<0?undefined:header).join('\n'),values,
    state:width&&min>=0&&max>min&&res>max?'parsed_candidate':'needs_layout_review'};
}

export function parseProtocolFields(text,kind,variableNames){
  const lines=linesOf(text),fields=[];
  if(kind==='packet'){
    for(const line of lines){
      const match=/^\s*([A-Z][A-Z0-9_]+(?:\([^)]*\))?)\s+(.+)$/.exec(line);
      if(match){
        const width=/^(\d+)(?=\s|$)/.exec(match[2]);
        fields.push({name:match[1],variable:variableNames.has(match[1].replace(/\(.*\)$/,''))?match[1].replace(/\(.*\)$/,''):null,bitLength:width?Number(width[1]):null,condition:match[2],raw:line,state:'needs_condition_review'});
      }
    }
  }else{
    let current=null;
    for(const line of lines){
      const match=/^\s*(\d+)\s+(.+)$/.exec(line);
      if(match){current={name:match[2].split(/\s{2,}/)[0].trim(),bitLength:null,condition:'',raw:line,state:'needs_layout_review',continuations:[]};fields.push(current);}
      else if(current&&line.trim()){current.raw+='\n'+line;current.continuations.push(line.trim().split(/\s{2,}/)[0]);}
    }
    for(const field of fields){
      let candidate=field.name;
      field.variable=variableNames.has(candidate)?candidate:null;
      for(const continuation of field.continuations){
        if(field.variable)break;
        if(/^[A-Z_]+$/.test(continuation)){candidate+=continuation;if(variableNames.has(candidate)){field.variable=candidate;field.name=candidate;}}
      }
      field.condition=field.raw;
      if(field.variable)field.state='parsed_candidate';
      delete field.continuations;
    }
  }
  return fields.map((field,i)=>({...field,ordinal:i+1}));
}

export function clauseReferences(text){
  return [...text.matchAll(/(?<![\w.])([1-8](?:\.\d+){1,9})(?!\w|\.\d)/g)]
    .filter(m=>!/(?:version|issue|baseline|release|SRS)\s*$/i.test(text.slice(Math.max(0,m.index-20),m.index))&&!/^\s*(?:km|cm|mm|m\/s|km\/h|bits?)\b/i.test(text.slice(m.index+m[0].length)))
    .map(m=>({number:m[1],raw:m[0],offset:m.index}));
}

/** Rebuild parser-owned candidates inside the functional import's transaction. */
export function populateTechnicalData(db,root,catalogue){
  const statements=new Map();
  const run=(sql,...args)=>{if(!statements.has(sql))statements.set(sql,db.prepare(sql));return statements.get(sql).run(...args);};
  const clauses=db.prepare('SELECT c.*,d.issue FROM clause c JOIN document d ON d.id=c.document_id ORDER BY c.id').all();
  const byNumber=new Map(),byId=new Map(clauses.map(c=>[c.id,c]));
  for(const c of clauses){const key=`${c.issue}:${c.clause_no}`;if(!byNumber.has(key))byNumber.set(key,[]);byNumber.get(key).push(c);}
  const targets=(number,issue)=>byNumber.get(`${issue}:${number}`)??[];
  const ref=(kind,id,c,protocol,description)=>{
    const reference=corpusId(kind,id);
    run('INSERT INTO technical_reference(corpus_id,kind,clause_id,protocol_id,description) VALUES(?,?,?,?,?)',reference,kind,c.id,protocol,description);
    return reference;
  };
  // Only these derived tables are parser-owned; reviewed rule/evidence records are preserved.
  for(const table of ['technical_reference_parse','component_io_parameter_reference','protocol_field_reference','functional_parameter_evidence','functional_parameter','component_io_parameter','component_io_function','protocol_packet_reference','protocol_field','technical_value','technical_variable','component_evidence','scenario_evidence','scenario_initial_value','classification_clause_reference','technical_clause_reference','technical_external_reference','technical_reference'])db.exec(`DELETE FROM ${table}`);
  for(const c of clauses){
    for(const mention of clauseReferences(c.source_text)){
      const found=targets(mention.number,c.issue);
      // Chapter 6 contains replacement/older-version references: do not assume a current-issue target.
      const versionAmbiguous=c.document_id.startsWith('SUBSET-026-6@');
      const resolved=found.length===1&&!versionAmbiguous?found[0].id:null;
      const id=ref('clause-reference',`${c.id}:${mention.offset}`,c,null,`Clause reference to ${mention.number}`);
      run('INSERT INTO technical_clause_reference VALUES(?,?,?,?,?,?,?)',id,c.id,mention.number,resolved,mention.raw,mention.offset,resolved?'resolved':found.length?'ambiguous':'unresolved');
    }
    for(const match of c.source_text.matchAll(/\b(?:SUBSET-\d{3}|ERA_ERTMS_\d+|FRMCS\s+(?:FIS|FFFIS)-\d+)\b/g)){
      const id=ref('external-reference',`${c.id}:${match.index}`,c,null,`External reference to ${match[0]}`);
      run('INSERT INTO technical_external_reference(id,clause_id,document_label,source_offset,raw_reference) VALUES(?,?,?,?,?)',id,c.id,match[0],match.index,match[0]);
    }
  }
  for(const row of db.prepare('SELECT r.*,d.issue FROM classification_row r JOIN document d ON d.id=r.document_id').all())for(const target of targets(row.referenced_clause,row.issue))run('INSERT INTO classification_clause_reference VALUES(?,?,?)',row.id,target.id,targets(row.referenced_clause,row.issue).length===1?'exact_candidate':'ambiguous_candidate');

  const protocols=db.prepare('SELECT * FROM protocol_element WHERE clause_id IS NOT NULL ORDER BY id').all();
  const vars=new Map();
  for(const p of protocols.filter(p=>p.element_kind==='variable')){
    const c=byId.get(p.clause_id);if(!c)continue;
    const data=parseVariable(p.raw_definition),reference=ref('variable',p.id,c,p.id,p.official_name);
    run('INSERT INTO technical_variable VALUES(?,?,?,?,?,?,?,?,?)',p.id,reference,data.bitLength,data.lengthRaw,data.minimum,data.maximum,data.resolution,data.description,data.state);
    for(const [i,value] of data.values.entries())run('INSERT INTO technical_value VALUES(?,?,?,?,?)',p.id,i+1,value.code,value.meaning,value.raw);
    const key=`${c.issue}:${p.official_name}`;if(!vars.has(key))vars.set(key,[]);vars.get(key).push({...p,...data});
  }
  const variable=(name,issue)=>{const found=vars.get(`${issue}:${name}`)??[];return found.length===1?found[0]:null;};
  const packetDefs=protocols.filter(p=>p.element_kind==='packet');
  const protocolFields=new Map();
  for(const p of protocols.filter(p=>['packet','radio_message'].includes(p.element_kind))){
    const c=byId.get(p.clause_id);if(!c)continue;
    ref('protocol',p.id,c,p.id,p.official_name);
    const names=new Set([...vars.keys()].filter(k=>k.startsWith(c.issue+':')).map(k=>k.slice(c.issue.length+1)));
    const fields=parseProtocolFields(p.raw_definition,p.element_kind,names);
    protocolFields.set(p.id,fields);
    for(const field of fields){
      const v=variable(field.variable,c.issue);
      run('INSERT INTO protocol_field VALUES(?,?,?,?,?,?,?,?)',p.id,field.ordinal,field.name,v?.id??null,p.element_kind==='packet'?field.bitLength:field.bitLength??v?.bitLength??null,field.condition,field.raw,field.state);
      run('INSERT INTO protocol_field_reference VALUES(?,?,?)',p.id,field.ordinal,ref('protocol-field',`${p.id}:${field.ordinal}`,c,p.id,field.name));
      for(const match of field.raw.matchAll(/\bpacket(?:\s+(?:number|type))?\s+(\d+)(?:\s+or\s+(\d+))?/gi)){
        for(const number of unique(match.slice(1).filter(Boolean).map(Number))){
          const namespace=c.clause_no.startsWith('8.6.')?'7.4.3.':c.clause_no.startsWith('8.7.')?'7.4.2.':null;
          const found=packetDefs.filter(def=>def.element_no===number&&byId.get(def.clause_id)?.issue===c.issue&&(!namespace||byId.get(def.clause_id).clause_no.startsWith(namespace)));
          run('INSERT OR IGNORE INTO protocol_packet_reference VALUES(?,?,?,?,?,?)',p.id,field.ordinal,number,found.length===1?found[0].id:null,found.length===1?'resolved':found.length?'ambiguous':'unresolved',match[0]);
        }
      }
    }
  }

  const componentFile='data/esig/contracts/subset-026-components-4.0.0.json';
  const full=path.join(root,componentFile);
  const mapping=fs.existsSync(full)?JSON.parse(fs.readFileSync(full,'utf8')):null;
  if(mapping){
    run(`INSERT INTO functional_source VALUES(?,?,?,1) ON CONFLICT(source_path) DO UPDATE SET sha256=excluded.sha256,kind=excluded.kind,active=1`,componentFile,createHash('sha256').update(fs.readFileSync(full)).digest('hex'),'component_mapping');
    for(const component of mapping.components){
      const found=targets(component.clause,mapping.issue);if(found.length!==1)continue;
      const c=found[0],reference=ref('component',component.id,c,null,component.name);
      run(`INSERT INTO component_type VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET definition_clause_id=COALESCE(component_type.definition_clause_id,excluded.definition_clause_id)`,component.id,component.name,component.scope,'ETCS',c.id);
      run('INSERT INTO component_evidence VALUES(?,?,?,?)',component.id,c.id,component.role??'definition_candidate',reference);
    }
    const interfaces=new Map();
    for(const spec of mapping.interfaces){
      const found=targets(spec.clause,mapping.issue);if(found.length!==1)continue;
      const c=found[0];
      if(!db.prepare('SELECT 1 FROM component_type WHERE id=?').get(spec.from)||!db.prepare('SELECT 1 FROM component_type WHERE id=?').get(spec.to))continue;
      const id=ref('interface',`${mapping.issue}:${spec.id}`,c,null,spec.name);
      run('INSERT INTO component_interface VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_clause_id=excluded.source_clause_id',id,spec.from,spec.to,spec.name,c.id);
      interfaces.set(spec.clause,{...spec,id});
    }
    for(const p of protocols.filter(p=>p.element_kind==='radio_message')){
      const c=byId.get(p.clause_id),spec=interfaces.get(c?.clause_no.split('.').slice(0,2).join('.'));
      if(!spec)continue;
      for(const operation of ['send','receive']){
        const identity=`${p.id}:${operation}`,id=corpusId('io-function',identity),reference=ref('io-function',identity,c,p.id,`${operation} ${p.official_name}`);
        const fn=`${operation}Message${p.element_no}_${spec.from.toLowerCase()}To${spec.to.toLowerCase()}`;
        run('INSERT INTO component_io_function VALUES(?,?,?,?,?,?,?,?,?,?)',id,reference,operation==='send'?spec.from:spec.to,operation==='send'?spec.to:spec.from,spec.id,p.id,operation,fn,JSON.stringify({requestedEtcsLevel:'2',scope:'radio_message_candidate',modeAndVersionReview:'pending',endpointBindingReview:'pending'}),'contract_only');
        for(const field of protocolFields.get(p.id)??[]){
          const v=variable(field.variable,c.issue);
          run('INSERT INTO component_io_parameter VALUES(?,?,?,?,?,?,?,?,?)',id,field.ordinal,field.name,operation==='send'?'input':'output',v?.id??null,field.bitLength??v?.bitLength??null,field.variable&&!/\b(?:if|optional|conditional|when|only)\b/i.test(field.raw)?'specified_field':'conditional_or_unresolved',p.id,field.ordinal);
          run('INSERT INTO component_io_parameter_reference VALUES(?,?,?)',id,field.ordinal,ref('io-parameter',`${id}:${field.ordinal}`,c,p.id,field.name));
        }
      }
    }
  }
  for(const m of catalogue.records){
    for(const [key,direction] of [['inputs','input'],['outputs','output']])for(const [i,entry] of m.contract[key].entries()){
      const name=typeof entry==='string'?entry:entry.name??entry.field;
      if(typeof name!=='string'||!name.trim())throw new Error(`Invalid functional ${direction} parameter: ${m.id}`);
      const expected=typeof entry==='object'?entry.variableName??null:null;
      const v=expected?variable(expected,m.applicability.srsIssue):null;
      run('INSERT INTO functional_parameter VALUES(?,?,?,?,?,?,?,?)',m.id,m.revision,direction,i+1,name,JSON.stringify(entry),expected,v?.id??null);
      for(const r of m.requirements)if(byId.has(r.clauseId))run('INSERT OR IGNORE INTO functional_parameter_evidence VALUES(?,?,?,?,?,?)',m.id,m.revision,direction,i+1,r.clauseId,'requirement_context_not_field_definition');
    }
  }
  for(const d of catalogue.datasets.filter(d=>d.kind==='scenario')){
    for(const [name,value] of Object.entries(d.data.sa.initial))run('INSERT INTO scenario_initial_value VALUES(?,?,?,?)',d.data.id,name,JSON.stringify(value),'synthetic_scenario');
    const issue=d.data.standards.document_issue.split(':').at(-1);
    for(const number of d.data.standards.source_clauses)for(const c of targets(number,issue))run('INSERT INTO scenario_evidence VALUES(?,?,?)',d.data.id,c.id,'synthetic_assertion_context');
  }
  const counts=Object.fromEntries(['technical_reference','technical_clause_reference','technical_external_reference','classification_clause_reference','technical_variable','technical_value','protocol_field','protocol_packet_reference','component_evidence','component_io_function','component_io_parameter','functional_parameter','functional_parameter_evidence','scenario_initial_value','scenario_evidence'].map(table=>[table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const parserSha256=digest(fs.readFileSync(new URL(import.meta.url)));
  const mappingSha256=mapping?digest(fs.readFileSync(full)):null;
  const sourceFingerprint=digest(JSON.stringify({documents:db.prepare('SELECT id,issue,sha256 FROM document ORDER BY id').all(),clauses:clauses.map(c=>[c.id,c.source_text]),protocols:protocols.map(p=>[p.id,p.official_name,p.raw_definition]),classifications:db.prepare('SELECT id,referenced_clause,raw_line FROM classification_row ORDER BY id').all(),authoredSources:db.prepare('SELECT source_path,sha256 FROM functional_source WHERE active=1 ORDER BY source_path').all()}));
  const parseId=corpusId('parse',JSON.stringify({parserSha256,mappingSha256,sourceFingerprint}));
  run('INSERT INTO technical_parse_run VALUES(?,?,?,?,?,?) ON CONFLICT(corpus_id) DO UPDATE SET generated_utc=excluded.generated_utc,counts_json=excluded.counts_json',parseId,parserSha256,mappingSha256,sourceFingerprint,new Date().toISOString(),JSON.stringify(counts));
  run('INSERT INTO technical_reference_parse SELECT corpus_id,? FROM technical_reference',parseId);
  return {...counts,parseId,parserSha256,mappingSha256,sourceFingerprint};
}
