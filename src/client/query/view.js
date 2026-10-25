// SQL query editor: presaved unique queries plus every call the app makes,
// most recent first with call counts. ▶ Play runs one statement and shows results.
import {EditorView,basicSetup} from 'codemirror';
import {keymap} from '@codemirror/view';
import {Compartment} from '@codemirror/state';
import {sql,SQLite} from '@codemirror/lang-sql';
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import {api,el,fmt,toast} from '../api.js';

const $=id=>document.getElementById(id);

export class QueryView{
  constructor({getDatabase,setDatabase}){
    this.getDatabase=getDatabase;this.setDatabase=setDatabase;
    this.source='';this.queries=[];this.selected=null;this.grid=null;this.schemaFor=null;
    this.lang=new Compartment();
    this.editor=new EditorView({parent:$('sql-editor'),doc:'SELECT name, type FROM sqlite_master ORDER BY type, name;',
      extensions:[basicSetup,EditorView.lineWrapping,this.lang.of(sql({dialect:SQLite})),
        keymap.of([{key:'Mod-Enter',run:()=>{this.play();return true;}}]),
        EditorView.updateListener.of(u=>{if(u.docChanged&&this.selected&&this.text()!==this.selected.sql){this.selected=null;this.renderList();this.syncButtons();}})]});
    $('query-play').addEventListener('click',()=>this.play());
    $('query-save').addEventListener('click',()=>this.save());
    $('query-delete').addEventListener('click',()=>this.remove());
    $('query-filter').addEventListener('input',()=>this.renderList());
    for(const tab of $('query-tabs').children)tab.addEventListener('click',()=>{
      for(const t of $('query-tabs').children)t.setAttribute('aria-selected',String(t===tab));
      this.source=tab.dataset.source;this.loadList();
    });
  }
  text(){return this.editor.state.doc.toString();}
  setText(s){this.editor.dispatch({changes:{from:0,to:this.editor.state.doc.length,insert:s}});}

  async activate(){
    $('query-db').textContent=this.getDatabase()?`on ${this.getDatabase()}`:'no database';
    await Promise.all([this.loadList(),this.loadSchema()]);
  }
  /** Table and column names for autocompletion. */
  async loadSchema(){
    const db=this.getDatabase();
    if(!db||this.schemaFor===db)return;
    try{
      const r=await api('/db/query',{method:'POST',body:{database:db,sql:"SELECT m.name AS t, p.name AS c FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%'"}});
      const schema={};
      for(const {t,c} of r.rows)(schema[t]??=[]).push(c);
      this.editor.dispatch({effects:this.lang.reconfigure(sql({dialect:SQLite,schema}))});
      this.schemaFor=db;
    }catch{/* autocomplete is optional */}
  }
  async loadList(){
    try{
      this.queries=(await api('/db/queries',{query:{source:this.source}})).queries;
      this.renderList();
    }catch(e){toast(e.message,'error');}
  }
  renderList(){
    const q=$('query-filter').value.trim().toLowerCase();
    const items=this.queries.filter(x=>!q||x.name.toLowerCase().includes(q)||x.sql.toLowerCase().includes(q));
    $('query-list').replaceChildren(...(items.length?items.map(x=>el('button',{type:'button',class:`q${this.selected?.id===x.id?' active':''}`,
      title:x.sql,onclick:()=>this.pick(x),ondblclick:()=>{this.pick(x);this.play();}},
      el('div',{class:'q-head'},el('span',{class:'q-name'},x.name),el('span',{class:'badge',title:'call count'},fmt(x.count))),
      el('div',{class:'q-meta'},
        x.preset?el('span',{class:'chip preset'},'preset'):null,
        x.lastSource?el('span',{class:'chip'},x.lastSource):null,
        el('span',{},x.database.split('/').pop()),
        el('span',{},x.lastCalled?relative(x.lastCalled):'never run'),
        x.lastMs!=null?el('span',{},`${x.lastMs} ms`):null,
        x.lastError?el('span',{style:'color:#c62828'},'error'):null))):
      [el('p',{class:'muted'},'No queries yet.')]));
  }
  pick(x){
    this.selected=x;this.setText(x.sql);this.selected=x;
    $('query-name').value=x.name;
    if(x.database!==this.getDatabase())this.setDatabase(x.database);
    this.renderList();this.syncButtons();
  }
  syncButtons(){$('query-delete').disabled=!this.selected;}

  async play(){
    const db=this.getDatabase(),text=this.text().trim();
    if(!db||!text)return;
    const status=$('query-status');
    status.className='muted';status.textContent='Running…';
    try{
      const r=await api('/db/query',{method:'POST',body:{database:db,sql:text}});
      if(r.columns.length){
        status.textContent=`${fmt(r.count)} row(s)${r.truncated?' (first 1,000 shown)':''} · ${r.ms} ms`;
        this.results(r.columns,r.rows);
      }else{
        status.textContent=`OK · ${fmt(r.changes)} row(s) changed · ${r.ms} ms`;
        this.results([],[]);
      }
      if($('query-name').value.trim()&&r.queryId&&(!this.selected||this.selected.name!==$('query-name').value.trim()))
        await api(`/db/queries/${r.queryId}`,{method:'PATCH',body:{name:$('query-name').value.trim()}}).catch(()=>{});
      await this.loadList();
      this.selected=this.queries.find(x=>x.id===r.queryId)??null;this.renderList();this.syncButtons();
      $('query-list').scrollTop=0;
    }catch(e){status.className='error';status.textContent=e.message;await this.loadList();}
  }
  results(columns,rows){
    this.grid?.destroy();$('query-grid').replaceChildren();
    this.grid=new Tabulator($('query-grid'),{data:rows,layout:'fitDataFill',height:'100%',placeholder:'No rows',
      columns:columns.map(c=>({title:c,field:c,maxWidth:420,tooltip:true,headerSort:true,
        formatter:cell=>{const v=cell.getValue();return v===null||v===undefined?'<span style="color:#aaa">NULL</span>':String(v).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));}}))});
  }
  async save(){
    const db=this.getDatabase(),text=this.text().trim(),name=$('query-name').value.trim();
    if(!db||!text)return;
    try{
      const {id}=await api('/db/queries',{method:'POST',body:{database:db,sql:text,name:name||undefined}});
      toast('Query saved (unique per database and SQL text)','ok');
      await this.loadList();this.selected=this.queries.find(x=>x.id===id)??null;this.renderList();this.syncButtons();
    }catch(e){toast(e.message,'error');}
  }
  async remove(){
    if(!this.selected||!confirm(`Delete saved query “${this.selected.name}” and its call history?`))return;
    try{await api(`/db/queries/${this.selected.id}`,{method:'DELETE'});this.selected=null;$('query-name').value='';await this.loadList();this.syncButtons();}
    catch(e){toast(e.message,'error');}
  }
}

function relative(iso){
  const s=(Date.now()-Date.parse(iso))/1000;
  if(s<60)return 'just now';if(s<3600)return `${Math.floor(s/60)} min ago`;
  if(s<86400)return `${Math.floor(s/3600)} h ago`;return new Date(iso).toLocaleDateString();
}
