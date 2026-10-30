import {api,el} from '../api.js';

const href=id=>`#/docs?corpus=${encodeURIComponent(id)}`;
const table=(head,rows)=>el('div',{class:'docs-table'},el('table',{},el('thead',{},el('tr',{},...head.map(h=>el('th',{},h)))),el('tbody',{},...rows.map(row=>el('tr',{},...row.map(cell=>el('td',{},cell??'Unresolved')))))));
const source=r=>`${r.standard} · issue ${r.standard_issue} · clause ${r.clause_no} · PDF pages ${r.start_page}–${r.end_page}`;

export async function renderTechnical(host,params,isCurrent){
  host.append(el('h1',{},'Technical corpus'),el('p',{class:'docs-lead'},'Local corpus IDs link to distinct standard, version, document and clause references.'));
  const result=el('div',{'aria-live':'polite'},'Loading technical references…');
  const selected=params.get('corpus');
  if(!selected){
    const search=el('input',{name:'q',type:'search',value:params.get('q')??'',placeholder:'Variable, message, clause…','aria-label':'Search technical corpus'});
    const kind=el('select',{name:'kind','aria-label':'Technical reference kind'},el('option',{value:''},'All kinds'),...['io-function','io-parameter','variable','protocol','protocol-field','component','interface','clause-reference','external-reference'].map(k=>el('option',{value:k},k)));
    kind.value=params.get('kind')??'';
    host.append(el('form',{class:'docs-actions',onsubmit:event=>{
      event.preventDefault();const query=new URLSearchParams({technical:'1',q:search.value,kind:kind.value});location.hash=`#/docs?${query}`;
    }},search,kind,el('button',{type:'submit'},'Search')));
  }
  host.append(result);
  try{
    const data=await api('/docs/technical',{query:selected?{corpusId:selected}:{q:params.get('q'),kind:params.get('kind'),limit:100}});
    if(!isCurrent())return;
    result.replaceChildren();
    if(!selected){
      result.append(el('p',{class:'muted'},`${data.references.length} results (maximum ${data.limit}). Narrow the search for more specific results.`),table(['Corpus record','Kind','Source standard / reference'],data.references.map(r=>[el('a',{href:href(r.corpus_id)},r.description),r.kind,source(r)])));
      return;
    }
    const r=data.reference;
    result.append(el('h2',{},r.description),el('p',{},el('code',{},r.corpus_id)),el('p',{},source(r)),el('p',{},`Source: ${r.source_filename} · ${r.publication_date}`),el('p',{},'Source SHA256: ',el('code',{},r.source_sha256)),el('p',{},'Parser SHA256: ',el('code',{},r.parser_sha256)),el('p',{class:'docs-gaps'},`Review state: ${r.review_state}. Parsed contracts and field conditions require source review.`));
    if(data.contract){
      result.append(el('h2',{},data.contract.function_name),el('p',{},`${data.contract.component_id} · ${data.contract.operation} · peer ${data.contract.peer_component_id} · ${data.contract.implementation_state}`),el('h3',{},'Parameters'),table(['Name','Direction','Bits','Range / scale','Field source','Variable definition'],data.parameters.map(p=>[p.name,p.direction,p.bit_length,[p.minimum_raw,p.maximum_raw,p.resolution_raw].filter(Boolean).join(' / ')||'See source',source(p),p.variable_corpus_id?el('a',{href:href(p.variable_corpus_id)},`${p.variable_standard} ${p.variable_standard_issue} · ${p.variable_clause_id}`):'Unresolved or compound field'])));
    }
    if(data.variable){
      const v=data.variable;
      result.append(el('h3',{},'Source values'),table(['Bits','Minimum','Maximum','Resolution'],[[v.bit_length,v.minimum_raw,v.maximum_raw,v.resolution_raw]]),el('p',{},v.description_raw),table(['Code / range','Meaning (source text)'],data.values.map(v=>[v.code_raw,v.meaning_raw])));
    }
    if(data.parameter){
      const p=data.parameter;
      result.append(el('h3',{},p.name),el('p',{},`${p.direction} · ${p.bit_length??'Unresolved'} bits · ${p.presence}`),el('a',{href:href(p.function_id)},'Parent I/O function'));
      if(p.variable_corpus_id)result.append(el('p',{},el('a',{href:href(p.variable_corpus_id)},`Variable definition: ${p.variable_standard} ${p.variable_standard_issue} · ${p.variable_clause_id}`)));
    }
    if(data.clauseReference)result.append(el('h3',{},'Referenced clause'),el('p',{},`${data.clauseReference.expected_clause_no} · ${data.clauseReference.resolution}`),el('p',{},data.clauseReference.to_clause_id??'Target is unresolved or version-ambiguous. The source above identifies the citing clause.'));
    if(data.externalReference)result.append(el('h3',{},'External standard'),el('p',{},`${data.externalReference.referencedStandard} · edition unresolved · ${data.externalReference.resolution}`),el('p',{},'The source provenance above identifies the citing standard; it does not supply an edition for the external standard.'));
    if(!data.contract&&data.fields.length)result.append(el('h3',{},'Protocol fields'),table(['Order','Name','Bits','Condition / layout','Variable definition'],data.fields.map(f=>[f.ordinal,f.name_raw,f.bit_length,f.condition_raw,f.variable_corpus_id?el('a',{href:href(f.variable_corpus_id)},'Source definition'):'Unresolved'])));
    if(data.protocol)result.append(el('details',{},el('summary',{},'Original extracted protocol text'),el('pre',{},data.protocol.raw_definition)));
    result.append(el('p',{},el('a',{href:`#/data?db=data%2Fsimworld%2Fsimworld.sqlite&table=clause&col=id&val=${encodeURIComponent(r.clause_id)}`},'Inspect the source clause')));
  }catch(error){if(isCurrent())result.replaceChildren(el('p',{role:'alert'},error.message));}
}
