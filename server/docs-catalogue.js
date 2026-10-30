import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const MODULES={
  'sim-spec':'SimSpec','base-models':'BaseModels','sim-world':'SimWorld',
  'sim-scene':'SimScene','sim-run':'SimRun','sim-states':'SimStates','sim-adaptor':'SimAdaptor',
};
export const isSimulationDocument=file=>file==='docs/esig-ingestion.md'||file.startsWith('docs/sigreqs/')||file.startsWith('docs/sim/');
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text=v=>typeof v==='string'&&v.trim().length>0;
const list=v=>Array.isArray(v)&&v.every(text);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>{throw new Error(`Invalid docs catalogue: ${message}`);};
const requireValue=(condition,message)=>{if(!condition)fail(message);};

function files(root,dir){
  const full=path.join(root,dir);
  if(!fs.existsSync(full))return [];
  requireValue(!fs.lstatSync(full).isSymbolicLink(),`${dir}: symlinks are unsupported`);
  return fs.readdirSync(full,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(entry=>{
    const rel=`${dir}/${entry.name}`;
    requireValue(!entry.isSymbolicLink(),`${rel}: symlinks are unsupported`);
    return entry.isDirectory()?files(root,rel):entry.isFile()?[rel]:[];
  });
}

// Read only a JSON object literal; never import or evaluate the source module.
export function parseMetadata(source,file='record'){
  const match=/\bexport\s+const\s+metadata\s*=\s*/g.exec(source);
  requireValue(match,`${file}: export const metadata is required`);
  const start=match.index+match[0].length;
  requireValue(source[start]==='{',`${file}: metadata must be a JSON object literal`);
  let depth=0,quoted=false,escape=false;
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0){
      requireValue(/^\s*(?:;|$)/.test(source.slice(i+1)),`${file}: metadata must be a literal without expressions`);
      try{return JSON.parse(source.slice(start,i+1));}catch(error){fail(`${file}: ${error.message}`);}
    }
  }
  fail(`${file}: unterminated metadata object`);
}

function validateRecord(m,file,root){
  const check=(ok,message)=>requireValue(ok,`${file}: ${message}`);
  check(object(m),'metadata must be an object');
  check(m.schemaVersion===1,'unsupported schemaVersion');
  for(const k of ['id','module','capability','functionName','functionSlug','title','purpose','origin'])check(text(m[k]),`${k} is required`);
  check(Number.isInteger(m.revision)&&m.revision>0,'revision must be a positive integer');
  check(['draft','reviewed','verified','retired'].includes(m.status),'invalid status');
  check(['official_interpretation','national_rule','engineering_rule','local_config','sim_assumption'].includes(m.origin),'invalid origin');
  const [, ,folder,capability,filename]=file.split('/');
  check(MODULES[folder]===m.module,'unknown or mismatched module');
  check(slug.test(m.capability)&&capability===m.capability&&file.split('/').length===5,'invalid capability folder');
  check(slug.test(m.functionSlug)&&/^[A-Za-z_$][\w$]*$/.test(m.functionName),'invalid function name');
  check(object(m.relationships),'relationships are required');
  check(m.relationships.parentId===null||text(m.relationships.parentId),'invalid parentId');
  for(const k of ['childrenIds','dependsOnIds','exceptionToIds','supersedesIds'])check(list(m.relationships[k])&&new Set(m.relationships[k]).size===m.relationships[k].length,`invalid ${k}`);
  check(Array.isArray(m.requirements)&&m.requirements.length>0,'requirements are required');
  check(m.requirements.filter(r=>r.primary===true).length===1,'exactly one primary requirement is required');
  for(const r of m.requirements){
    check(object(r)&&text(r.refcode)&&slug.test(r.refcode)&&typeof r.primary==='boolean'&&text(r.role)&&text(r.implementationRequirement),'invalid requirement');
    for(const k of ['documentId','srsIssue','clauseNo','clauseId','sourceSha256'])check(r[k]===null||text(r[k]),`requirement ${k} is required (nullable)`);
    for(const k of ['startPage','endPage'])check(r[k]===null||(Number.isInteger(r[k])&&r[k]>0),`invalid ${k}`);
    check(r.startPage===null||r.endPage===null||r.startPage<=r.endPage,'invalid page span');
    check(r.sourceSha256===null||/^[a-f0-9]{64}$/.test(r.sourceSha256),'invalid source hash');
    check(list(r.classificationRowIds)&&['pending','reviewed'].includes(r.classificationReview)&&['pending','reviewed'].includes(r.visualReview),'invalid evidence review fields');
    if(r.refcode.startsWith('subset-026-')){
      check(/^SUBSET-026-[1-9]@[\d.]+$/.test(r.documentId??'')&&text(r.clauseNo)&&text(r.srsIssue),'invalid SUBSET-026 reference');
      check(r.documentId.endsWith(`@${r.srsIssue}`)&&r.refcode===`subset-026-${r.srsIssue.replaceAll('.','-')}-${r.clauseNo.replaceAll('.','-')}`,'mismatched source refcode');
      check(new RegExp(`^${r.documentId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}:${r.clauseNo.replaceAll('.','\\.')}:[1-9][0-9]*$`).test(r.clauseId??''),'invalid clause occurrence');
    }
  }
  check(filename===`${m.functionSlug}-sig-${m.requirements.find(r=>r.primary).refcode}.js`,'filename/refcode mismatch');
  check(object(m.applicability)&&text(m.applicability.srsIssue)&&['pending','reviewed'].includes(m.applicability.reviewState),'invalid applicability');
  for(const k of ['etcsLevels','etcsModes','etcsSystemVersions'])check(list(m.applicability[k]),`invalid ${k}`);
  check(m.applicability.etcsLevels.every(level=>['0','NTC','1','2'].includes(level)),'invalid ETCS level');
  check(m.requirements.filter(r=>r.refcode.startsWith('subset-026-')).every(r=>r.srsIssue===m.applicability.srsIssue),'applicability issue mismatch');
  check(object(m.contract),'contract is required');
  for(const k of ['inputs','outputs','preconditions','stateChanges'])check(Array.isArray(m.contract[k])&&m.contract[k].every(v=>text(v)||object(v)),`invalid contract ${k}`);
  for(const k of ['failureBehavior','determinism'])check(text(m.contract[k]),`contract ${k} is required`);
  check(object(m.implementation)&&['not_implemented','implemented','retired'].includes(m.implementation.state),'invalid implementation');
  for(const k of ['path','exportName','ruleId'])check(m.implementation[k]===null||text(m.implementation[k]),`invalid implementation ${k}`);
  check(m.implementation.ruleRevision===null||(Number.isInteger(m.implementation.ruleRevision)&&m.implementation.ruleRevision>0),'invalid ruleRevision');
  if(m.implementation.state==='implemented')check(text(m.implementation.path)&&text(m.implementation.exportName),'implemented records require a path and export');
  check(Array.isArray(m.acceptance),'acceptance is required');
  const testIds=new Set();
  for(const a of m.acceptance){
    check(object(a)&&['positive','negative','fault'].includes(a.kind)&&['not_run','passed','failed','waived'].includes(a.result),'invalid acceptance item');
    for(const k of ['id','given','when','then'])check(text(a[k]),`acceptance ${k} is required`);
    check(!testIds.has(a.id),'duplicate acceptance ID');testIds.add(a.id);
    check(a.testPath===null||text(a.testPath),'testPath is required (nullable)');
    if(a.result==='passed')check(text(a.testPath),'passed test requires a testPath');
    if(a.testPath)validatePath(root,a.testPath,check);
  }
  if(m.implementation.path)validatePath(root,m.implementation.path,check);
  check(object(m.review)&&list(m.review.unresolved),'invalid review');
  for(const k of ['reviewedBy','reviewedAt'])check(m.review[k]===null||text(m.review[k]),`invalid review ${k}`);
  if(['reviewed','verified'].includes(m.status)){
    check(text(m.review.reviewedBy)&&text(m.review.reviewedAt)&&Number.isFinite(Date.parse(m.review.reviewedAt)),'review identity and date are required');
    check(!m.review.unresolved.length&&m.applicability.reviewState==='reviewed'&&m.applicability.etcsLevels.length&&m.applicability.etcsModes.length&&m.applicability.etcsSystemVersions.length,'review gaps block promotion');
    check(m.requirements.every(r=>r.sourceSha256&&r.startPage&&r.endPage&&r.classificationRowIds.length&&r.classificationReview==='reviewed'&&r.visualReview==='reviewed'),'unresolved evidence blocks promotion');
  }
  if(m.status==='verified'){
    check(m.implementation.state==='implemented','verified record must be implemented');
    check(['positive','negative','fault'].every(kind=>m.acceptance.some(a=>a.kind===kind&&a.result==='passed'))&&m.acceptance.every(a=>a.result==='passed'),'verification requires passed positive, negative and fault tests');
  }
}

function validatePath(root,rel,check){
  check(text(rel)&&!path.isAbsolute(rel)&&!rel.split(/[\\/]/).includes('..'),'invalid repository path');
  const full=path.resolve(root,rel),base=fs.realpathSync(root)+path.sep;
  check(fs.existsSync(full)&&fs.statSync(full).isFile(),`missing repository file ${rel}`);
  check(fs.realpathSync(full).startsWith(base),`repository path escapes root: ${rel}`);
}

function evidenceWarnings(root,records){
  const file=path.join(root,'data/esig/esig.sqlite');
  const db=fs.existsSync(file)?new DatabaseSync(file,{readOnly:true}):null;
  const warnings=[];
  try{
    for(const m of records){
      const gaps=[];
      for(const r of m.requirements){
        if(!r.sourceSha256||!r.startPage||!r.endPage||r.visualReview!=='reviewed'||r.classificationReview!=='reviewed'||!r.classificationRowIds.length)gaps.push(`Evidence review incomplete: ${r.refcode}`);
        if(!db){gaps.push('Local ESIG registry unavailable; evidence not reconciled');continue;}
        const row=db.prepare('SELECT c.*,d.sha256 FROM clause c JOIN document d ON d.id=c.document_id WHERE c.id=?').get(r.clauseId);
        if(!row)gaps.push(`Clause not found: ${r.clauseId}`);
        else if(row.document_id!==r.documentId||row.clause_no!==r.clauseNo||(r.sourceSha256&&row.sha256!==r.sourceSha256)||(r.startPage&&row.start_page!==r.startPage)||(r.endPage&&row.end_page!==r.endPage))gaps.push(`Evidence mismatch: ${r.refcode}`);
        for(const id of r.classificationRowIds){
          const classification=db.prepare('SELECT referenced_clause FROM classification_row WHERE id=?').get(id);
          if(!classification||classification.referenced_clause!==r.clauseNo)gaps.push(`Classification mismatch: ${id}`);
        }
      }
      if(m.applicability.reviewState!=='reviewed')gaps.push('Applicability review pending');
      gaps.push(...m.review.unresolved);
      if(gaps.length){
        requireValue(!['reviewed','verified'].includes(m.status),`${m.id}: ${[...new Set(gaps)].join('; ')}`);
        warnings.push({id:m.id,messages:[...new Set(gaps)]});
      }
    }
  }finally{db?.close();}
  return warnings;
}

function validateRelationships(records){
  const byId=new Map(records.map(m=>[m.id,m]));
  requireValue(byId.size===records.length,'duplicate record IDs');
  for(const m of records){
    const r=m.relationships;
    for(const id of [r.parentId,...r.childrenIds,...r.dependsOnIds,...r.exceptionToIds,...r.supersedesIds].filter(Boolean))requireValue(byId.has(id)&&id!==m.id,`${m.id}: unknown or self relationship ${id}`);
    if(r.parentId)requireValue(byId.get(r.parentId).relationships.childrenIds.includes(m.id),`${m.id}: parent/child links must be reciprocal`);
    for(const child of r.childrenIds)requireValue(byId.get(child).relationships.parentId===m.id,`${m.id}: parent/child links must be reciprocal`);
    const seen=new Set([m.id]);
    let parent=r.parentId;
    while(parent){requireValue(!seen.has(parent),`${m.id}: hierarchy cycle`);seen.add(parent);parent=byId.get(parent).relationships.parentId;}
  }
}

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  requireValue(typeof value!=='number'||Number.isFinite(value),'non-finite JSON number');
  return value;
}

function validateDataset(data,kind,file){
  const check=(ok,message)=>requireValue(ok,`${file}: ${message}`);
  check(object(data),'data must be a JSON object');
  const rows=(value,label)=>check(Array.isArray(value)&&value.every(object),`${label} must be an array of objects`);
  if(kind==='scenario'){
    check(text(data.id)&&object(data.ga)&&object(data.sa),'scenario requires id, ga and sa');
    check(text(data.ga.id)&&object(data.sa.initial),'GA identity and initial state are required');
    for(const key of ['nodes','edges','levelTransitions'])rows(data.ga[key],`ga.${key}`);
    const nodeIds=data.ga.nodes.map(n=>n.id);
    check(nodeIds.every(text)&&new Set(nodeIds).size===nodeIds.length,'invalid GA node IDs');
    check(data.ga.edges.every(e=>nodeIds.includes(e.from)&&nodeIds.includes(e.to)&&Number.isFinite(e.distance_m)&&e.distance_m>=0),'invalid GA edge');
    rows(data.sa.stimuli,'sa.stimuli');rows(data.sa.assertions,'sa.assertions');
    check(data.sa.stimuli.every(s=>Number.isFinite(s.at_ms)&&s.at_ms>=0&&text(s.type)),'invalid stimulus');
    check(data.sa.assertions.every(a=>text(a.description)&&text(a.source_rule_id)),'invalid assertion');
    check(object(data.standards)&&list(data.standards.source_clauses)&&text(data.standards.document_issue),'source references are required');
  }
  if('volumes' in data){
    rows(data.volumes,'volumes');
    check(text(data.issue)&&data.volumes.every(v=>Number.isInteger(v.chapter)&&v.chapter>=1&&v.chapter<=9&&text(v.filename)&&Number.isInteger(v.pages)&&v.pages>0&&/^[a-f0-9]{64}$/.test(v.sha256)),'invalid source volume');
  }
  if('defined_application_levels' in data){
    rows(data.defined_application_levels,'defined_application_levels');
    rows(data.not_supported_as_new_level,'not_supported_as_new_level');
    check(data.defined_application_levels.every(v=>['0','NTC','1','2'].includes(v.id)&&text(v.name)&&text(v.source)&&text(v.status)),'invalid application level');
  }
}

export function loadDocsCatalogue(root){
  const all=files(root,'docs');
  const documents=all.filter(f=>f.endsWith('.md')&&isSimulationDocument(f)).map(sourcePath=>({...readDocument(root,sourcePath),category:sourcePath.startsWith('docs/sim/')?'Simulation':'ESIG'}));
  const records=all.filter(f=>f.startsWith('docs/sigreqs/')&&f.endsWith('.js')).map(sourcePath=>{
    const m=parseMetadata(fs.readFileSync(path.join(root,sourcePath),'utf8'),sourcePath);
    canonical(m);validateRecord(m,sourcePath,root);
    return {...m,sourcePath};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:a.revision-b.revision);
  validateRelationships(records);
  const warnings=evidenceWarnings(root,records);
  const dataFiles=[...files(root,'data/esig/catalog'),...files(root,'data/esig/examples')].filter(f=>f.endsWith('.json'));
  const datasets=dataFiles.map(sourcePath=>{
    let data;
    try{data=JSON.parse(fs.readFileSync(path.join(root,sourcePath),'utf8'));canonical(data);}
    catch(error){fail(`${sourcePath}: ${error.message}`);}
    const kind=sourcePath.startsWith('data/esig/examples/')?'scenario':'source';
    validateDataset(data,kind,sourcePath);
    return {id:sourcePath,sourcePath,kind,title:data.title??data.set??(data.defined_application_levels?`${data.standard} application levels (${data.issue})`:data.id??path.basename(sourcePath)),data};
  });
  const repositoryLinks=repositoryDocuments(root,all).map(({id,title})=>({id,title}));
  const payload=canonical({schemaVersion:1,documents,records,datasets,modules:MODULES,repositoryLinks,warnings});
  const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {...payload,hash};
}

function readDocument(root,sourcePath){
  requireValue(!fs.lstatSync(path.join(root,sourcePath)).isSymbolicLink(),`${sourcePath}: symlinks are unsupported`);
  const content=fs.readFileSync(path.join(root,sourcePath),'utf8');
  return {id:sourcePath,sourcePath,title:content.match(/^#\s+(.+)$/m)?.[1]??path.basename(sourcePath),content};
}

function repositoryDocuments(root,all){
  const readme=fs.readdirSync(root).sort().find(f=>f.toLowerCase()==='readme.md');
  return [...(readme?[readme]:[]),...all.filter(f=>f.endsWith('.md')&&!isSimulationDocument(f))].map(file=>readDocument(root,file));
}

export function loadRepositoryDocs(root){
  const all=files(root,'docs');
  return {
    documents:repositoryDocuments(root,all),
    simulationLinks:all.filter(f=>f.endsWith('.md')&&isSimulationDocument(f)).map(f=>{const {id,title}=readDocument(root,f);return {id,title};}),
  };
}
