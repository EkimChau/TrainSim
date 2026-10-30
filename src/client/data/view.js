// Database viewer and live editor (Tabulator grid). Every edit is saved immediately.
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import {api,el,fmt,toast} from '../api.js';
import {DATABASE_CATEGORIES} from '../../shared/database-categories.js';

const $=id=>document.getElementById(id);
const GROUPS=[['simworld_','Simulation instances'],['functional_','Authored requirements'],['technical_','Technical references'],['component_','Components & interfaces'],['protocol_','Protocol definitions'],['corpus_','Dataset references'],['translink_','Timetables'],['scope_','Station scope'],['rail_','Railway layers'],['topo_','Topology'],['osm_','Source geometry'],['rtree_','Spatial indexes'],['','Other tables & views']];
const size=bytes=>bytes>=1048576?`${(bytes/1048576).toFixed(1)} MiB`:bytes>=1024?`${(bytes/1024).toFixed(1)} KiB`:`${bytes} B`;
const dataHref=(database,table='',filter=null,mode='rows')=>'#/data?'+new URLSearchParams({db:database,...(table?{table}:{}),...(filter?{col:filter.column,val:String(filter.value),op:filter.op??'='}:{}),...(mode==='structure'&&table?{mode}:{})});
const markupTable=(head,rows)=>el('div',{class:'database-schema-table'},el('table',{},el('thead',{},el('tr',{},...head.map(h=>el('th',{},h)))),el('tbody',{},...rows.map(row=>el('tr',{},...row.map(cell=>el('td',{},cell??'—')))))));

export class DataView{
  constructor({onSelectDatabase=()=>{},onRefreshDatabases=async()=>{}}={}){
    this.onSelectDatabase=onSelectDatabase;this.onRefreshDatabases=onRefreshDatabases;
    this.databases=[];this.category='';this.mode='rows';this.request=0;this.activation=0;this.tableRequest=0;
    this.database='';this.table='';this.page=0;this.info=null;this.grid=null;this.tables=[];this.filter=null;this.sort=null;
    $('database-search').addEventListener('input',()=>this.renderDatabases());
    $('database-archives').addEventListener('change',()=>this.renderDatabases());
    $('database-refresh').addEventListener('click',async()=>{const id=this.database;await this.onRefreshDatabases();if(this.databases.some(d=>d.id===id))this.onSelectDatabase(id,false);await this.refresh();});
    $('database-overview').addEventListener('click',()=>this.navigate(this.database));
    $('database-query').addEventListener('click',()=>{this.onSelectDatabase(this.database,false);location.hash='#/query';});
    for(const [id,mode] of [['table-rows','rows'],['table-structure','structure']])$(id).addEventListener('click',()=>this.navigate(this.database,this.table,this.filter,mode));
    $('table-filter').addEventListener('input',()=>{this.renderTables();if(!this.table)this.renderOverview();});
    $('table-internals').addEventListener('change',()=>{this.renderTables();if(!this.table)this.renderOverview();});
    $('table-refresh').addEventListener('click',()=>this.refresh());
    $('page-prev').addEventListener('click',()=>{if(this.page>0){this.page--;this.browse();}});
    $('page-next').addEventListener('click',()=>{if(this.info?.hasMore){this.page++;this.browse();}});
    $('filter-form').addEventListener('submit',e=>{e.preventDefault();this.applyFilter();});
    $('filter-clear').addEventListener('click',()=>{this.filter=null;$('filter-column').value='';$('filter-value').value='';this.navigate(this.database,this.table);});
    $('row-add').addEventListener('click',()=>this.openAdd());
    $('row-delete').addEventListener('click',()=>this.deleteSelected());
    $('row-dialog').addEventListener('close',()=>this.insertFromDialog());
  }

  setDatabases(databases){this.databases=databases;this.renderDatabases();this.renderSummary();}
  navigate(id,table='',filter=null,mode='rows'){
    if(!id)return;
    this.onSelectDatabase(id,false);
    const target=dataHref(id,table,filter,mode);
    if(location.hash===target)this.activate(id,new URLSearchParams(target.split('?')[1]));
    else location.hash=target;
  }
  async activate(id,params=new URLSearchParams()){
    const activation=++this.activation;
    this.mode=params.get('mode')==='structure'?'structure':'rows';
    await this.setDatabase(id);
    if(activation!==this.activation)return;
    const table=params.get('table');
    if(table){await this.open(table,params.has('col')?{column:params.get('col'),value:params.get('val'),op:params.get('op')??'='}:null);}
    else this.showOverview();
  }
  renderDatabases(){
    const all=this.databases.filter(d=>$('database-archives').checked||!d.archived);
    $('database-categories').replaceChildren(...[['','All'],...Object.entries(DATABASE_CATEGORIES).map(([k,v])=>[k,v.label])].map(([key,label])=>el('button',{type:'button','aria-pressed':String(this.category===key),onclick:()=>{
      this.category=key;this.renderDatabases();const matching=all.filter(d=>!key||d.category===key);if(matching.length&&!matching.some(d=>d.id===this.database))this.navigate(matching[0].id);
    }},label,el('small',{},all.filter(d=>!key||d.category===key).length))));
    const q=$('database-search').value.trim().toLowerCase();
    const matches=all.filter(d=>(!this.category||d.category===this.category)&&(d.title+' '+d.id+' '+d.purpose).toLowerCase().includes(q));
    const host=$('database-list');host.replaceChildren();
    for(const [category,meta] of Object.entries(DATABASE_CATEGORIES)){
      const databases=matches.filter(d=>d.category===category);if(!databases.length)continue;
      host.append(el('h2',{},meta.label),...databases.map(d=>el('button',{type:'button',class:'database-file'+(d.id===this.database?' active':''),'aria-pressed':String(d.id===this.database),onclick:()=>this.navigate(d.id)},el('span',{class:'database-file-title'},d.title,el('small',{},d.readOnly?'Read-only':'Editable')),el('span',{class:'database-file-purpose'},d.purpose),el('code',{},d.id),el('small',{},`${size(d.bytes)}${d.archived?' · archived':''}`))));
    }
    if(!matches.length)host.append(el('p',{class:'muted'},'No matching database files.'));
  }
  renderSummary(){
    const d=this.databases.find(d=>d.id===this.database);if(!d){$('database-summary').replaceChildren();return;}
    $('database-summary').replaceChildren(el('div',{class:'database-breadcrumb'},DATABASE_CATEGORIES[d.category]?.label??'System',' / ',d.title),el('div',{class:'database-summary-facts'},el('code',{},d.id),el('span',{},size(d.bytes)),el('span',{class:'database-access '+(d.readOnly?'readonly':'editable')},d.readOnly?'Read-only reference':d.category==='simworld'?'Fictitious runtime · editable instances':'Editable system data')));
  }

  async setDatabase(id){
    if(id===this.database&&this.tables.length)return;
    const selected=this.databases.find(d=>d.id===id);
    if(selected){
      if(this.category&&this.category!==selected.category)this.category=selected.category;
      if(selected.archived)$('database-archives').checked=true;
      const q=$('database-search').value.trim().toLowerCase();
      if(q&&!(selected.title+' '+selected.id+' '+selected.purpose).toLowerCase().includes(q))$('database-search').value='';
    }
    ++this.request;this.database=id;this.table='';this.tables=[];this.info=null;this.filter=null;$('table-filter').value='';
    this.grid?.destroy();this.grid=null;$('table-grid').replaceChildren();$('database-content').replaceChildren(el('p',{role:'status'},'Loading database…'));
    $('row-add').disabled=true;$('row-delete').disabled=true;
    this.renderDatabases();this.renderSummary();
    await this.loadTables();
  }
  async loadTables(){
    const database=this.database,request=++this.tableRequest;
    if(!database){$('table-list').replaceChildren(el('p',{class:'muted'},'No database files found.'));return;}
    $('database-table-count').textContent='Reading tables…';
    try{
      const data=await api('/db/tables',{query:{database}});
      if(database!==this.database||request!==this.tableRequest)return;
      this.tables=data.tables;
      $('database-table-count').textContent=`${this.tables.filter(t=>t.type==='table'&&!t.internal).length} tables · ${this.tables.filter(t=>t.type==='view').length} views`;
      this.renderTables();
    }catch(e){if(database===this.database){$('database-table-count').textContent=e.message;$('table-list').replaceChildren();toast(e.message,'error');}}
  }
  renderTables(){
    const q=$('table-filter').value.trim().toLowerCase();
    const databaseReadOnly=this.databases.find(d=>d.id===this.database)?.readOnly;
    const list=$('table-list');list.replaceChildren();
    const used=new Set();
    for(const [prefix,label] of GROUPS){
      const items=this.tables.filter(t=>!used.has(t.name)&&t.name.startsWith(prefix)&&($('table-internals').checked||!t.internal)&&(!q||t.name.toLowerCase().includes(q)));
      if(!items.length)continue;
      list.append(el('div',{class:'group'},label));
      for(const t of items){
        used.add(t.name);
        list.append(el('button',{type:'button',class:t.name===this.table?'active':'',title:`${t.name} · ${t.readOnly?'Read-only table or view':'Editable table'}`,onclick:()=>this.navigate(this.database,t.name)},
          el('span',{},`${t.type==='view'?'◇ ':''}${t.name}`),el('small',{},`${t.readOnly&&!databaseReadOnly?'ref · ':''}${t.rows===null?'—':fmt(t.rows)}`)));
      }
    }
    if(!list.children.length)list.append(el('p',{class:'muted'},'No matching tables or views.'));
  }
  showOverview(){
    ++this.request;this.table='';this.info=null;this.filter=null;this.grid?.destroy();this.grid=null;
    $('table-grid').hidden=true;$('filter-form').hidden=true;$('database-table-modes').hidden=true;
    $('database-content').hidden=false;$('table-title').textContent='Database overview';$('table-total').textContent='';
    $('row-add').disabled=true;$('row-delete').disabled=true;$('table-hint').textContent='Choose a table to browse records or inspect its structure.';
    this.renderTables();this.renderOverview();
  }
  renderOverview(){
    const d=this.databases.find(d=>d.id===this.database),q=$('table-filter').value.toLowerCase();
    const tables=this.tables.filter(t=>($('table-internals').checked||!t.internal)&&t.name.toLowerCase().includes(q));
    const body=$('database-content');
    if(!d){body.replaceChildren(el('p',{},'Select a database from System, SimWorld or Corpus.'));return;}
    body.replaceChildren(el('h2',{},d.title),el('p',{class:'database-overview-description'},DATABASE_CATEGORIES[d.category].description),el('p',{},d.purpose),el('div',{class:'database-statistics'},...[[this.tables.filter(t=>t.type==='table'&&!t.internal).length,'Tables'],[this.tables.filter(t=>t.type==='view').length,'Views'],[size(d.bytes),'File size']].map(([value,label])=>el('div',{},el('strong',{},value),el('span',{},label)))),el('p',{class:'muted'},`File updated: ${new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Brisbane'}).format(new Date(d.modified))} (Brisbane)`),markupTable(['Table / view','Rows','Access'],tables.map(t=>[el('a',{href:dataHref(this.database,t.name)},t.name),t.rows===null?'—':fmt(t.rows),t.readOnly?'Read-only':t.type==='view'?'View':'Editable'])));
  }
  /** Open a table, optionally pre-filtered (deep links from the map inspector). */
  open(name,filter=null){
    this.table=name;this.page=0;this.sort=null;this.filter=filter?{column:filter.column,op:filter.op??'=',value:String(filter.value)}:null;
    if(!name.toLowerCase().includes($('table-filter').value.trim().toLowerCase()))$('table-filter').value='';
    this.renderTables();return this.browse();
  }
  async refresh(){const database=this.database;await this.loadTables();if(database!==this.database)return;if(this.table)await this.browse();else this.renderOverview();}

  applyFilter(){
    const column=$('filter-column').value,op=$('filter-op').value,value=$('filter-value').value;
    this.filter=column?{column,op,value}:null;this.page=0;this.navigate(this.database,this.table,this.filter);
  }

  async browse(){
    if(!this.table)return;
    const database=this.database,table=this.table,request=++this.request,mode=this.mode;
    this.info=null;this.grid?.destroy();this.grid=null;$('table-grid').replaceChildren();$('table-grid').hidden=true;$('filter-form').hidden=true;$('database-content').hidden=false;
    $('database-content').replaceChildren(el('p',{role:'status'},`Loading ${table}…`));
    $('database-table-modes').hidden=false;$('table-rows').setAttribute('aria-pressed',String(mode==='rows'));$('table-structure').setAttribute('aria-pressed',String(mode==='structure'));
    $('row-add').disabled=true;$('row-delete').disabled=true;
    try{
      const query={database:this.database,table:this.table,page:this.page};
      if(this.filter)Object.assign(query,{filterColumn:this.filter.column,filterOp:this.filter.op,filterValue:this.filter.value});
      if(this.sort)Object.assign(query,{sort:this.sort.column,dir:this.sort.dir});
      const info=await api(mode==='structure'?'/db/schema':'/db/table',{query});
      if(request!==this.request||database!==this.database||table!==this.table)return;
      this.info=info;
      if(mode==='structure'){this.renderStructure(info);return;}
      $('database-content').hidden=true;$('table-grid').hidden=false;$('filter-form').hidden=false;
      const editable=info.type==='table'&&!info.virtual&&!info.readOnly;
      $('table-hint').textContent=info.readOnly?'Reference data is read-only. Edit simulation instances and parameters instead.':'SimWorld/local data: edits save immediately. Click a cell to edit.';
      $('table-title').textContent=this.table;
      $('table-total').textContent=`${fmt(info.total)} rows${this.filter?' (filtered)':''} · ${info.type}${info.pk.length?` · key: ${info.pk.join(', ')}`:''}`;
      $('row-add').disabled=!editable;$('row-delete').disabled=true;
      $('page-prev').disabled=this.page===0;$('page-next').disabled=!info.hasMore;
      $('page-label').textContent=`Page ${this.page+1} of ${Math.max(1,Math.ceil(info.total/info.pageSize))}`;
      const fc=$('filter-column');
      fc.replaceChildren(el('option',{value:''},'Filter column…'),...info.columns.map(c=>el('option',{value:c.name},c.name)));
      if(this.filter){fc.value=this.filter.column;$('filter-op').value=this.filter.op;$('filter-value').value=this.filter.value;}
      this.renderGrid(info,editable);
    }catch(e){if(request===this.request){this.grid?.destroy();this.grid=null;$('table-grid').hidden=true;$('filter-form').hidden=true;$('database-content').hidden=false;$('database-content').replaceChildren(el('p',{role:'alert'},e.message));toast(e.message,'error');}}
  }

  renderStructure(info){
    this.grid?.destroy();this.grid=null;$('table-grid').hidden=true;$('filter-form').hidden=true;$('database-content').hidden=false;
    $('table-title').textContent=info.table;$('table-total').textContent=`${info.columns.length} columns · ${info.foreignKeys.length} foreign-key fields`;
    $('table-hint').textContent='Schema inspection is read-only. Follow a relationship to browse the referenced table.';
    $('database-content').replaceChildren(el('h2',{},'Columns'),markupTable(['Column','Type','Key','NOT NULL','Default'],info.columns.map(c=>[c.name,c.type||'any',c.pk?`Primary key ${c.pk}`:'',c.required?'Yes':'No',c.defaultValue])),el('h2',{},'Foreign keys'),info.foreignKeys.length?markupTable(['Column','Referenced table','Referenced column','On update','On delete'],info.foreignKeys.map(f=>[f.from,el('a',{href:dataHref(this.database,f.table)},f.table),f.to??'Primary key',f.on_update,f.on_delete])):el('p',{class:'muted'},'No foreign keys declared.'),el('h2',{},'Indexes'),info.indexes.length?markupTable(['Index','Columns','Unique'],info.indexes.map(i=>[i.name,i.columns.map(c=>c??'(expression)').join(', '),i.unique?'Yes':'No'])):el('p',{class:'muted'},'No indexes declared.'),el('details',{},el('summary',{},'SQL definition'),el('pre',{},info.sql)));
  }

  renderGrid(info,editable){
    const database=this.database,table=this.table;
    const columns=[...(info.includeRowid?[{name:'__rowid',type:'INTEGER',pk:1}]:[]),...info.columns];
    this.grid?.destroy();
    $('table-grid').replaceChildren();
    this.grid=new Tabulator($('table-grid'),{
      data:info.rows,layout:'fitDataFill',height:'100%',placeholder:'No rows',
      index:info.includeRowid?'__rowid':(info.pk.length===1?info.pk[0]:undefined),
      selectableRows:editable?true:false,
      columns:columns.map(c=>({
        title:c.name+(this.sort?.column===c.name?(this.sort.dir==='asc'?' ▲':' ▼'):''),field:c.name,headerSort:false,
        headerClick:c.name.startsWith('__')?undefined:()=>{this.sort={column:c.name,dir:this.sort?.column===c.name&&this.sort.dir==='asc'?'desc':'asc'};this.page=0;this.browse();},headerTooltip:`${c.type||'any'}${c.pk?' · primary key':''}${c.required?' · required':''}`,
        cssClass:c.pk?'pk':'',maxWidth:420,tooltip:true,
        editor:editable&&!c.pk&&!c.name.startsWith('__')&&!/BLOB/i.test(c.type)?(/(_json|coords|tags)$/.test(c.name)?'textarea':'input'):false,
        formatter:cell=>{const v=cell.getValue();return v===null||v===undefined?'<span style="color:#aaa">NULL</span>':String(v).length>300?escape(String(v).slice(0,300))+'…':escape(String(v));},
      })),
    });
    this.grid.on('rowSelectionChanged',rows=>{$('row-delete').disabled=!rows.length||!editable;$('row-delete').textContent=rows.length?`Delete ${rows.length} selected`:'Delete selected';});
    this.grid.on('cellEdited',async cell=>{
      const field=cell.getField(),row=cell.getRow().getData();
      const original=this.keyOf({...row,[field]:cell.getOldValue()},info);
      let value=cell.getValue();
      if(value==='')value=null;
      try{
        const r=await api('/db/rows',{method:'PATCH',body:{database,table,original,changes:{[field]:value}}});
        if(r.changes!==1)throw new Error('No row changed; refresh and retry');
        toast(`Saved ${field}`,'ok');
      }catch(e){toast(e.message,'error');cell.restoreOldValue();}
    });
  }
  keyOf(row,info=this.info){
    const o={};
    for(const k of info.pk)o[k]=row[k];
    if(info.includeRowid)o.__rowid=row.__rowid;
    return o;
  }

  async deleteSelected(){
    const rows=this.grid?.getSelectedData()??[];
    if(!rows.length)return;
    if(!confirm(`Delete ${rows.length} row(s) from ${this.table}? This changes the live database.`))return;
    try{
      const r=await api('/db/rows',{method:'DELETE',body:{database:this.database,table:this.table,originals:rows.map(r=>this.keyOf(r))}});
      toast(`Deleted ${r.changes} row(s)`,'ok');this.browse();
    }catch(e){toast(e.message,'error');}
  }

  openAdd(){
    const info=this.info;if(!info)return;
    if(info.readOnly||this.mode!=='rows')return;
    this.addContext={database:this.database,table:this.table};
    const osmish=info.pk.some(k=>/^(id|osm_id|way_id|node_id|relation_id)$/.test(k))&&/^(osm_|rail_)/.test(this.table);
    $('row-dialog-hint').textContent=(osmish?'Hand-made rows should use a NEGATIVE id so the next ingest never overwrites them. ':'')+
      'Leave a field empty for its default/NULL. Identical rows are rejected.';
    $('row-fields').replaceChildren(...info.columns.flatMap(c=>{
      const id='new-'+c.name;
      return [el('label',{for:id},c.pk?el('b',{},c.name):c.name),
        el('input',{id,name:c.name,placeholder:`${c.type||'any'}${c.required?' (required)':''}${c.defaultValue!=null?` default ${c.defaultValue}`:''}`})];
    }));
    $('row-dialog').returnValue='';
    $('row-dialog').showModal();
  }
  async insertFromDialog(){
    if($('row-dialog').returnValue!=='ok')return;
    const record={};
    for(const input of $('row-fields').querySelectorAll('input'))if(input.value!=='')record[input.name]=input.value;
    try{
      await api('/db/rows',{method:'POST',body:{...this.addContext,record}});
      toast('Row inserted','ok');this.browse();this.loadTables();
    }catch(e){toast(e.message,'error');}
  }
}

const escape=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
