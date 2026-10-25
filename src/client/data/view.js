// Database viewer and live editor (Tabulator grid). Every edit is saved immediately.
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import {api,el,fmt,toast} from '../api.js';

const $=id=>document.getElementById(id);
const GROUPS=[['scope_','Scope (stations.xlsx)'],['rail_','Railway layers'],['topo_','Topology'],['osm_','Raw OSM'],
  ['rtree_','Spatial index'],['','Other']];

export class DataView{
  constructor(){
    this.database='';this.table='';this.page=0;this.info=null;this.grid=null;this.tables=[];this.filter=null;this.sort=null;
    $('table-filter').addEventListener('input',()=>this.renderTables());
    $('table-refresh').addEventListener('click',()=>this.refresh());
    $('page-prev').addEventListener('click',()=>{if(this.page>0){this.page--;this.browse();}});
    $('page-next').addEventListener('click',()=>{if(this.info?.hasMore){this.page++;this.browse();}});
    $('filter-form').addEventListener('submit',e=>{e.preventDefault();this.applyFilter();});
    $('filter-clear').addEventListener('click',()=>{this.filter=null;$('filter-column').value='';$('filter-value').value='';this.page=0;this.browse();});
    $('row-add').addEventListener('click',()=>this.openAdd());
    $('row-delete').addEventListener('click',()=>this.deleteSelected());
    $('row-dialog').addEventListener('close',()=>this.insertFromDialog());
  }

  async setDatabase(id){
    if(id===this.database&&this.tables.length)return;
    this.database=id;this.table='';this.tables=[];
    await this.loadTables();
  }
  async loadTables(){
    if(!this.database){$('table-list').replaceChildren(el('p',{class:'muted'},'No database found. Run npm run ingest.'));return;}
    try{
      this.tables=(await api('/db/tables',{query:{database:this.database}})).tables;
      this.renderTables();
      if(this.table&&!this.tables.some(t=>t.name===this.table))this.table='';
      if(!this.table&&this.tables.length)this.open(this.tables.find(t=>t.type==='table'&&!t.name.startsWith('rtree'))?.name??this.tables[0].name);
    }catch(e){toast(e.message,'error');}
  }
  renderTables(){
    const q=$('table-filter').value.trim().toLowerCase();
    const list=$('table-list');list.replaceChildren();
    const used=new Set();
    for(const [prefix,label] of GROUPS){
      const items=this.tables.filter(t=>!used.has(t.name)&&t.name.startsWith(prefix)&&(!q||t.name.toLowerCase().includes(q)));
      if(!items.length)continue;
      list.append(el('div',{class:'group'},label));
      for(const t of items){
        used.add(t.name);
        list.append(el('button',{type:'button',class:t.name===this.table?'active':'',onclick:()=>this.open(t.name)},
          el('span',{},`${t.type==='view'?'◇ ':''}${t.name}`),el('small',{},fmt(t.rows))));
      }
    }
  }
  /** Open a table, optionally pre-filtered (deep links from the map inspector). */
  open(name,filter=null){
    this.table=name;this.page=0;this.sort=null;this.filter=filter?{column:filter.column,op:'=',value:String(filter.value)}:null;
    this.renderTables();this.browse();
  }
  refresh(){this.loadTables().then(()=>this.browse());}

  applyFilter(){
    const column=$('filter-column').value,op=$('filter-op').value,value=$('filter-value').value;
    this.filter=column?{column,op,value}:null;this.page=0;this.browse();
  }

  async browse(){
    if(!this.table)return;
    try{
      const query={database:this.database,table:this.table,page:this.page};
      if(this.filter)Object.assign(query,{filterColumn:this.filter.column,filterOp:this.filter.op,filterValue:this.filter.value});
      if(this.sort)Object.assign(query,{sort:this.sort.column,dir:this.sort.dir});
      const info=await api('/db/table',{query});
      this.info=info;
      const editable=info.type==='table'&&!info.virtual;
      $('table-title').textContent=this.table;
      $('table-total').textContent=`${fmt(info.total)} rows${this.filter?' (filtered)':''} · ${info.type}${info.pk.length?` · key: ${info.pk.join(', ')}`:''}`;
      $('row-add').disabled=!editable;$('row-delete').disabled=true;
      $('page-prev').disabled=this.page===0;$('page-next').disabled=!info.hasMore;
      $('page-label').textContent=`Page ${this.page+1} of ${Math.max(1,Math.ceil(info.total/info.pageSize))}`;
      const fc=$('filter-column');
      fc.replaceChildren(el('option',{value:''},'Filter column…'),...info.columns.map(c=>el('option',{value:c.name},c.name)));
      if(this.filter){fc.value=this.filter.column;$('filter-op').value=this.filter.op;$('filter-value').value=this.filter.value;}
      this.renderGrid(info,editable);
    }catch(e){toast(e.message,'error');}
  }

  renderGrid(info,editable){
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
      const original=this.keyOf({...row,[field]:cell.getOldValue()});
      let value=cell.getValue();
      if(value==='')value=null;
      try{
        const r=await api('/db/rows',{method:'PATCH',body:{database:this.database,table:this.table,original,changes:{[field]:value}}});
        if(r.changes!==1)throw new Error('No row changed; refresh and retry');
        toast(`Saved ${field}`,'ok');
      }catch(e){toast(e.message,'error');cell.restoreOldValue();}
    });
  }
  keyOf(row){
    const o={};
    for(const k of this.info.pk)o[k]=row[k];
    if(this.info.includeRowid)o.__rowid=row.__rowid;
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
      await api('/db/rows',{method:'POST',body:{database:this.database,table:this.table,record}});
      toast('Row inserted','ok');this.browse();this.loadTables();
    }catch(e){toast(e.message,'error');}
  }
}

const escape=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
