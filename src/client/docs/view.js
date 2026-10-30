import {api,el} from '../api.js';
import {docHref,documentLinks,renderMarkdown} from './markdown.js';
import {renderDataset} from './datasets.js';
import {renderTechnical} from './technical.js';

const $=id=>document.getElementById(id);
const recordHref=id=>`#/docs?id=${encodeURIComponent(id)}`;
const dataHref=id=>`#/docs?data=${encodeURIComponent(id)}`;
const moduleHref=name=>`#/docs?module=${encodeURIComponent(name)}`;
const section=(title,...nodes)=>el('section',{class:'docs-section'},el('h2',{},title),...nodes);
const json=value=>el('pre',{},el('code',{},JSON.stringify(value,null,2)));
const badge=text=>el('span',{class:'docs-badge'},text);
const FILTERS={module:'Module',capability:'Capability',status:'Review status',issue:'Source issue',level:'ETCS level',mode:'ETCS mode'};
const OWNERSHIP={SimSpec:'Compile reviewed requirements into configuration.',BaseModels:'Define component types and typed interfaces.',SimWorld:'Own deployed infrastructure and train state.',SimScene:'Define initial state, stimuli and assertions.',SimRun:'Advance deterministic simulation decisions.',SimStates:'Record decision evidence, events and replay.',SimAdaptor:'Display the world and simulation outcomes.'};

export function matchesRecord(record,filters,query){
  const values={...record,issue:record.applicability.srsIssue,level:record.applicability.etcsLevels,mode:record.applicability.etcsModes};
  return Object.entries(filters).every(([k,v])=>!v||(Array.isArray(values[k])?values[k].includes(v):values[k]===v))&&JSON.stringify(record).toLowerCase().includes(query.toLowerCase());
}

export class DocsView{
  constructor({onIngest=()=>{}}={}){
    this.onIngest=onIngest;
    this.catalogue=null;this.params=new URLSearchParams();this.filters={};this.request=0;
    $('docs-search').addEventListener('input',()=>this.list());
    $('docs-refresh').addEventListener('click',()=>this.load(true));
    $('docs-clear').addEventListener('click',()=>{
      this.filters={};$('docs-search').value='';this.populateFilters();this.list();
    });
  }
  async activate(params){this.params=params;if(!this.catalogue)await this.load();else{this.list();this.detail();}}
  async load(ingest=false){
    const request=++this.request;
    $('docs-status').textContent='Reading documentation files…';
    $('docs-detail').replaceChildren(el('p',{},'Loading documentation…'));
    $('docs-list').replaceChildren();
    try{
      const data=await api(ingest?'/docs/ingest':'/docs',ingest?{method:'POST'}:{});
      if(request!==this.request)return;
      this.catalogue=data;this.populateFilters();this.list();this.detail();
      await this.onIngest();
    }catch(error){
      if(request!==this.request)return;
      this.catalogue=null;
      $('docs-status').textContent='Could not ingest documentation.';
      $('docs-detail').replaceChildren(el('h1',{},'Documentation unavailable'),el('p',{role:'alert'},error.message),el('p',{},'Correct the source files and choose Reload files.'));
    }
  }
  populateFilters(){
    const records=this.catalogue?.records??[];
    const values={
      module:records.map(r=>r.module),capability:records.map(r=>r.capability),status:records.map(r=>r.status),
      issue:records.map(r=>r.applicability.srsIssue),level:records.flatMap(r=>r.applicability.etcsLevels),mode:records.flatMap(r=>r.applicability.etcsModes),
    };
    $('docs-filters').replaceChildren(...Object.entries(FILTERS).map(([key,label])=>{
      const options=[...new Set(values[key])].sort();
      if(!options.includes(this.filters[key]))this.filters[key]='';
      const select=el('select',{'aria-label':label,onchange:e=>{this.filters[key]=e.target.value;this.list();}},el('option',{value:''},`All ${label.toLowerCase()}s`),...options.map(v=>el('option',{value:v},v)));
      select.value=this.filters[key];return el('label',{class:'field'},el('span',{},label),select);
    }));
  }
  list(){
    if(!this.catalogue)return;
    const q=$('docs-search').value.trim().toLowerCase();
    const filtered=Object.values(this.filters).some(Boolean);
    const docs=filtered?[]:this.catalogue.documents.filter(d=>(d.title+' '+d.content).toLowerCase().includes(q));
    const records=this.catalogue.records.filter(r=>matchesRecord(r,this.filters,q));
    const datasets=filtered?[]:this.catalogue.datasets.filter(d=>JSON.stringify(d).toLowerCase().includes(q));
    const host=$('docs-list');host.replaceChildren();
    const item=(href,title,sub,selected)=>el('a',{href,...(selected?{'aria-current':'page'}:{})},el('strong',{},title),el('small',{},sub));
    for(const category of ['Repository','ESIG','Simulation']){
      const guides=docs.filter(d=>d.category===category);
      if(guides.length)host.append(el('h2',{},`${category} guides`),...guides.map(d=>item(docHref(d.id),d.title,d.sourcePath,this.params.get('doc')===d.id)));
    }
    for(const [kind,label] of [['source','ESIG source data'],['scenario','Scenarios']]){
      const group=datasets.filter(d=>d.kind===kind);
      if(group.length)host.append(el('h2',{},label),...group.map(d=>item(dataHref(d.id),d.title,d.sourcePath,this.params.get('data')===d.id)));
    }
    const modules=[...new Set(records.map(r=>r.module))].sort();
    for(const module of modules){
      host.append(el('h2',{},el('a',{href:moduleHref(module)},module)));
      for(const capability of [...new Set(records.filter(r=>r.module===module).map(r=>r.capability))].sort()){
        host.append(el('h3',{},capability));
        host.append(...records.filter(r=>r.module===module&&r.capability===capability).map(r=>item(recordHref(r.id),r.title,`${r.functionName} · ${r.status}`,this.params.get('id')===r.id)));
      }
    }
    if(!records.length&&!docs.length&&!datasets.length)host.append(el('p',{},'No documentation matches these filters.'));
    $('docs-status').textContent=`${docs.length} guides · ${datasets.length} data files · ${records.length} requirements · ${this.catalogue.warnings.length} records with review gaps`;
  }
  detail(){
    const generation=this.detailGeneration=(this.detailGeneration??0)+1;
    const host=$('docs-detail');host.replaceChildren();
    host.scrollTop=0;$('docs-toc').replaceChildren();
    const c=this.catalogue;
    if(this.params.has('technical')||this.params.has('corpus')){
      renderTechnical(host,this.params,()=>generation===this.detailGeneration);return;
    }
    if(![...this.params.keys()].length){const readme=c.documents.find(d=>/^readme\.md$/i.test(d.id));if(readme){this.params.set('doc',readme.id);this.list();}}
    if(this.params.has('doc')){
      const doc=c.documents.find(d=>d.id===this.params.get('doc'));
      if(!doc){host.append(el('h1',{},'Document not found'));return;}
      host.append(el('p',{class:'muted'},doc.sourcePath),renderMarkdown(doc.content,doc.sourcePath,documentLinks(c.documents,c.repositoryLinks)));
      const toc=el('nav',{'aria-label':'On this page',class:'docs-toc'},el('strong',{},'On this page'));
      for(const heading of host.querySelectorAll('h2,h3'))toc.append(el('a',{href:docHref(doc.id,heading.id)},heading.textContent));
      $('docs-toc').append(toc);
      const anchor=this.params.get('section');
      if(anchor)host.querySelectorAll('[id]').forEach(node=>{if(node.id===anchor)node.scrollIntoView({block:'start'});});
      else host.scrollTop=0;
      return;
    }
    if(this.params.has('data')){
      const dataset=c.datasets.find(d=>d.id===this.params.get('data'));
      host.append(dataset?renderDataset(dataset,c.records):el('h1',{},'Data file not found'));return;
    }
    if(this.params.has('module')){
      const name=this.params.get('module');
      if(!Object.values(c.modules).includes(name)){host.append(el('h1',{},'Module not found'));return;}
      const records=c.records.filter(r=>r.module===name);
      host.append(el('h1',{},name),el('p',{class:'docs-lead'},OWNERSHIP[name]),el('p',{},el('a',{href:docHref('docs/sim/modules.md')},'Module interfaces and ownership')),el('h2',{},'Function requirements'));
      if(!records.length)host.append(el('p',{},'No function requirement records have been authored for this module yet.'));
      for(const r of records)host.append(el('div',{class:'docs-requirement'},el('a',{href:recordHref(r.id)},r.title),el('p',{},r.purpose),badge(r.status),badge(r.implementation.state)));
      return;
    }
    const r=c.records.find(r=>r.id===this.params.get('id'));
    if(!r){
      if(this.params.has('id')){host.append(el('h1',{},'Requirement not found'));return;}
      const sources=c.datasets.filter(d=>d.kind==='source'),scenarios=c.datasets.filter(d=>d.kind==='scenario');
      const implemented=c.records.filter(r=>r.implementation.state==='implemented').length;
      const verified=c.records.filter(r=>r.status==='verified').length;
      host.append(el('p',{class:'docs-eyebrow'},'Repository / ESIG / simulation'),el('h1',{},'TrainSim Docs'),el('p',{class:'docs-lead'},'Repository guides, source requirements, module contracts and simulation data.'),el('div',{class:'docs-stats'},...[[c.documents.length,'Guides'],[sources.length,'Source catalogues'],[scenarios.length,'Scenarios'],[c.records.length,'Function requirements'],[implemented,'Implemented'],[verified,'Verified']].map(([value,label])=>el('div',{},el('strong',{},value),el('span',{},label)))),el('p',{class:'docs-gaps'},`${c.warnings.length} requirement records have review gaps. Draft documentation and synthetic scenarios do not establish ETCS compliance.`));
      if(c.storage){
        const e=c.storage.extraction;
        host.append(section('Database ingestion',el('p',{},`Corpus input: ${c.storage.database} · runtime snapshot: ${c.storage.runtimeDatabase??'not published'} · fictitious SimWorld`),el('p',{},`${e.counts.source_page}/${e.expectedPages} source pages extracted · ${e.counts.clause} clause candidates · ${e.counts.classification_row} classification rows`),el('p',{},`${e.missingSources.length} missing PDF files · missing tools: ${e.missingTools.join(', ')||'none'}`),...['functional_function','source_page','clause','classification_row','protocol_element'].map(table=>el('p',{},el('a',{href:`#/data?db=data%2Fsimworld%2Fsimworld.sqlite&table=${table}`},`Browse ${table}`)))));
        if(c.storage.technical)host.append(section('Technical corpus',el('p',{},`${c.storage.technical.technical_variable} variable definitions · ${c.storage.technical.component_io_function} component I/O contracts · ${c.storage.technical.component_io_parameter} parameters`),el('a',{href:'#/docs?technical=1'},'Browse standards and technical references')));
      }
      host.append(section('Start here',...c.documents.map(d=>el('p',{},el('a',{href:docHref(d.id)},d.title)))),section('ESIG source data',...sources.map(d=>el('p',{},el('a',{href:dataHref(d.id)},d.title)))),section('Simulation scenarios',...scenarios.map(d=>el('p',{},el('a',{href:dataHref(d.id)},d.title)))));
      host.append(section('Modules',el('div',{class:'docs-cards'},...Object.values(c.modules).map(name=>el('a',{href:moduleHref(name),class:'docs-card'},el('h3',{},name),el('p',{},OWNERSHIP[name]),el('small',{},`${c.records.filter(r=>r.module===name).length} function requirements`))))),el('p',{class:'muted'},`Catalogue SHA256: ${c.hash}`));return;
    }
    host.append(el('p',{class:'muted'},`${r.module} / ${r.capability} / revision ${r.revision}`),el('h1',{},r.title),el('div',{class:'docs-badges'},badge(r.status),badge(r.implementation.state),badge(r.origin)),el('p',{class:'docs-lead'},r.purpose),el('p',{},el('code',{},r.functionName)),el('p',{class:'muted'},r.sourcePath));
    const gaps=c.warnings.find(w=>w.id===r.id)?.messages??[];
    if(gaps.length)host.append(section('Review gaps',el('ul',{class:'docs-gaps'},...gaps.map(g=>el('li',{},g)))));
    host.append(section('Requirements',...r.requirements.map(req=>el('div',{class:'docs-requirement'},el('h3',{},`${req.refcode}${req.primary?' · primary':''}`),el('p',{},req.implementationRequirement),el('p',{class:'muted'},`${req.role} · ${req.documentId??'Internal'} · clause ${req.clauseNo??'—'} · pages ${req.startPage??'?'}–${req.endPage??'?'}`),req.clauseId?el('a',{href:`#/data?db=data%2Fsimworld%2Fsimworld.sqlite&table=clause&col=id&val=${encodeURIComponent(req.clauseId)}`},req.clauseId):'No source clause',el('p',{class:'muted'},`Visual review: ${req.visualReview} · classification: ${req.classificationReview}`)))));
    host.append(section('Relationships',...Object.entries(r.relationships).map(([key,value])=>{
      const ids=Array.isArray(value)?value:value?[value]:[];
      return el('p',{},el('strong',{},`${key}: `),...(ids.length?ids.flatMap(id=>[el('a',{href:recordHref(id)},c.records.find(x=>x.id===id)?.title??id),' ']):['None declared']));
    })));
    host.append(section('Applicability',json(r.applicability)),section('Execution contract',json(r.contract)),section('Implementation',json(r.implementation)),section('Acceptance',...r.acceptance.map(a=>el('div',{class:'docs-requirement'},el('h3',{},a.id,' ',badge(`${a.kind} · ${a.result}`)),el('p',{},el('strong',{},'Given '),a.given),el('p',{},el('strong',{},'When '),a.when),el('p',{},el('strong',{},'Then '),a.then),el('p',{class:'muted'},a.testPath??'No executable test linked')))),section('Review',json(r.review)));
    const raw=el('details',{},el('summary',{},'JSON metadata'),json(r));host.append(raw);
  }
}
