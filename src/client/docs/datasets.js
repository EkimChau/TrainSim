import {el} from '../api.js';

const json=value=>el('pre',{},el('code',{},JSON.stringify(value,null,2)));
function table(columns,rows){
  return el('div',{class:'docs-table'},el('table',{},el('thead',{},el('tr',{},...columns.map(c=>el('th',{},c)))),el('tbody',{},...rows.map(row=>el('tr',{},...row.map(value=>el('td',{},value??'—')))))));
}
const recordLink=r=>el('a',{href:`#/docs?id=${encodeURIComponent(r.id)}`},r.title);

export function renderDataset(dataset,records){
  const d=dataset.data;
  const host=el('div',{},el('p',{class:'muted'},dataset.sourcePath),el('h1',{},dataset.title));
  if(dataset.kind==='scenario'){
    host.append(el('p',{class:'docs-gaps'},d.disclaimer??'Synthetic scenario; not an executed acceptance test.'),el('h2',{},'Source requirements'));
    host.append(el('p',{},`Source issue: ${d.standards?.document_issue??'Unspecified'} · ${d.standards?.source_confidence??'Review pending'}`));
    for(const clause of d.standards?.source_clauses??[]){
      const linked=records.filter(r=>r.requirements.some(req=>req.clauseNo===clause&&`${req.documentId?.split('@')[0]?.replace(/-\d+$/,'')}:${req.srsIssue}`===d.standards?.document_issue));
      host.append(el('p',{},el('code',{},clause),' ',...linked.map(recordLink)));
    }
    host.append(el('h2',{},'General arrangement'),el('p',{},`${d.ga.id??'Unnamed GA'} · ${d.ga.basis??'Unspecified basis'} · ${d.ga.nodes?.length??0} nodes · ${d.ga.edges?.length??0} edges`));
    host.append(table(['From','To','Distance (m)','ETCS level','RBC'],(d.ga.edges??[]).map(e=>[e.from,e.to,e.distance_m,e.level,e.rbc_id])));
    host.append(el('h3',{},'Level transitions'),json(d.ga.levelTransitions??[]),el('h2',{},'Initial state'),json(d.sa.initial??{}));
    host.append(el('h2',{},'Stimuli'),table(['Time (ms)','Event','Position'],(d.sa.stimuli??[]).map(s=>[s.at_ms,s.type,s.position])));
    host.append(el('h2',{},'Expected assertions'),table(['Rule','Assertion','Event','Mode'],(d.sa.assertions??[]).map(a=>[a.source_rule_id,a.description,a.expected_event,a.expected_mode])));
    host.append(el('p',{class:'muted'},'These are expected outcomes from the file. No scenario has been executed by opening this page.'));
  }else if(Array.isArray(d.volumes)){
    host.append(el('p',{class:'docs-lead'},`${d.baseline??''} · issue ${d.issue??''} · published ${d.publication_date??''}`),el('p',{},d.meaning??''),el('p',{},`${d.volumes.length} pinned volumes · ${d.volumes.reduce((sum,v)=>sum+(Number(v.pages)||0),0)} source pages in the manifest. Local extraction/review completeness is tracked separately.`));
    host.append(table(['Chapter','Source file','Pages','SHA256'],d.volumes.map(v=>[v.chapter,v.filename,v.pages,el('code',{},v.sha256)])));
  }else if(Array.isArray(d.defined_application_levels)){
    host.append(el('p',{class:'docs-lead'},`${d.standard} · issue ${d.issue}`),el('p',{},d.distinction),table(['Application level','Name','Source clause','Status'],d.defined_application_levels.map(v=>[v.id,v.name,v.source,v.status])),el('h2',{},'Excluded levels'),table(['Level','Source clause','Status'],(d.not_supported_as_new_level??[]).map(v=>[v.id,v.source,v.status])),el('p',{},d.simulation_contract));
  }else host.append(el('p',{},'Source catalogue data is available below.'));
  host.append(el('details',{},el('summary',{},'Source JSON'),json(d)));
  return host;
}
