import {api,el} from '../api.js';
import {documentLinks,readmeHref,renderMarkdown} from './markdown.js';

const $=id=>document.getElementById(id);
export class ReadmeView{
  constructor(){
    this.data=null;this.params=new URLSearchParams();this.request=0;
    $('readme-refresh').addEventListener('click',()=>this.load());
    $('readme-search').addEventListener('input',()=>this.list());
  }
  async activate(params){this.params=params;if(!this.data)await this.load();else this.render();}
  async load(){
    const request=++this.request;
    $('readme-status').textContent='Reading repository guides…';
    $('readme-list').replaceChildren();$('readme-detail').replaceChildren();
    try{
      const data=await api('/readme');
      if(request!==this.request)return;
      this.data=data;this.render();
    }catch(error){
      if(request!==this.request)return;
      this.data=null;$('readme-status').textContent='Repository guides unavailable';
      $('readme-detail').replaceChildren(el('p',{role:'alert'},error.message));
    }
  }
  list(){
    if(!this.data)return;
    const q=$('readme-search').value.toLowerCase();
    const selected=this.params.get('doc')??this.data.documents[0]?.id;
    const docs=this.data.documents.filter(d=>(d.title+' '+d.content).toLowerCase().includes(q));
    $('readme-list').replaceChildren(...docs.map(d=>el('a',{href:readmeHref(d.id),...(selected===d.id?{'aria-current':'page'}:{})},el('strong',{},d.title),el('small',{},d.sourcePath))));
    if(!docs.length)$('readme-list').append(el('p',{},'No repository guides match this search.'));
    $('readme-status').textContent=`${docs.length} repository guides`;
  }
  render(){
    this.list();
    const host=$('readme-detail');host.replaceChildren();
    const selected=this.params.get('doc')??this.data.documents[0]?.id;
    const doc=this.data.documents.find(d=>d.id===selected);
    if(!doc){host.append(el('h1',{},'Repository guide not found'));return;}
    host.append(el('p',{class:'muted'},doc.sourcePath),renderMarkdown(doc.content,doc.sourcePath,documentLinks(this.data.simulationLinks,this.data.documents)));
    const toc=el('nav',{'aria-label':'On this page',class:'docs-toc'},el('strong',{},'On this page'));
    for(const heading of host.querySelectorAll('h2,h3'))toc.append(el('a',{href:readmeHref(doc.id,heading.id)},heading.textContent));
    $('readme-toc').replaceChildren(toc);
    const anchor=this.params.get('section');
    if(anchor)host.querySelectorAll('[id]').forEach(node=>{if(node.id===anchor)node.scrollIntoView({block:'start'});});
    else host.scrollTop=0;
  }
}
