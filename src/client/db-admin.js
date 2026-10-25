import {EditorView,basicSetup} from 'codemirror';
import {sql,SQLite} from '@codemirror/lang-sql';
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator_midnight.min.css';

const $=id=>document.getElementById(id);
const state={database:'',table:'',page:0,tableGrid:null,resultGrid:null,tableInfo:null,queries:[],selected:null};
const editor=new EditorView({parent:$('sql-editor'),doc:'SELECT name, type FROM sqlite_master WHERE type IN (\'table\', \'view\') ORDER BY name;',extensions:[basicSetup,sql({dialect:SQLite}),EditorView.theme({'&':{backgroundColor:'#0d1b2a',color:'#e4f1fc'},'.cm-content':{caretColor:'#84bfff'},'.cm-gutters':{backgroundColor:'#15283c',color:'#85a4bb',border:'none'}})]});
function setSQL(s){editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:s}});}
function status(message,error=false,target='db-table-status'){$(target).textContent=message;$(target).style.color=error?'#ffad84':'#a2d8bb';}
async function api(route,{method='GET',body,query}={}){
  const url='/api/db'+route+(query?'?'+new URLSearchParams(query):'');
  const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}
function grid(container,rows,columns,editable=false){
  container.replaceChildren();
  const defs=columns.map(c=>{
    const col=typeof c==='string'?{name:c,type:'',pk:0}:c;
    const isBlob=/BLOB/i.test(col.type||'');
    return {title:col.name,field:col.name,headerTooltip:col.type||'',minWidth:115,widthGrow:1,editor:editable&&!col.pk&&!col.name.startsWith('__trainsim_')&&!isBlob?'input':false,tooltip:true};
  });
  return new Tabulator(container,{data:rows,layout:'fitDataStretch',height:editable?'360px':'240px',placeholder:'No rows',columns:defs,index:columns.some(c=>(c.name??c)==='__trainsim_rowid')?'__trainsim_rowid':undefined,selectableRows:editable?1:false});
}
function original(row){
  const selected={};
  for(const key of state.tableInfo.pk)selected[key]=row[key];
  if(state.tableInfo.includeRowid)selected.__trainsim_rowid=row.__trainsim_rowid;
  return selected;
}
async function browse(){
  if(!state.table)return;
  try{
    const data=await api('/table',{query:{database:state.database,table:state.table,page:state.page}});
    state.tableInfo=data;state.selected=null;
    state.tableGrid=grid($('table-grid'),data.rows,[...(data.includeRowid?[{name:'__trainsim_rowid',type:'INTEGER',pk:1}]:[]),...data.columns],data.type==='table');
    state.tableGrid.on('rowSelectionChanged',(rows)=>{state.selected=rows[0]||null;$('db-delete').disabled=!state.selected||data.type!=='table';});
    state.tableGrid.on('cellEdited',async cell=>{
      const column=cell.getColumn().getField();
      if(column.startsWith('__trainsim_')||data.pk.includes(column))return;
      const row=cell.getRow().getData();
      let value=cell.getValue();
      const declared=(data.columns.find(c=>c.name===column)?.type||'').toUpperCase();
      if(typeof value==='string'&&value.trim()!==''&&/INT|REAL|NUMERIC|FLOAT|DOUBLE|DECIMAL/.test(declared)){
        const numeric=Number(value);if(Number.isFinite(numeric))value=numeric;
      }
      try{
        const response=await api('/rows',{method:'PATCH',body:{database:state.database,table:state.table,original:original(row),changes:{[column]:value}}});
        if(response.changes!==1)throw new Error('No row changed; refresh and retry');
        status(`Saved ${column}`);await browse();await loadQueries();
      }catch(e){status(e.message,true);await browse();}
    });
    $('db-add').disabled=data.type!=='table';$('db-delete').disabled=true;
    $('page-prev').disabled=state.page===0;$('page-next').disabled=!data.hasMore;
    $('page-count').textContent=`Page ${state.page+1}`;
    $('table-title').textContent=`${state.table} · ${data.type}`;
    status(`${data.rows.length} rows on page · click a cell to edit; select a row to delete`);
    await loadQueries();
  }catch(e){status(e.message,true);}
}
async function tables(){
  if(!state.database)return;
  try{
    const data=await api('/tables',{query:{database:state.database}});
    const list=$('table-list');list.replaceChildren();
    for(const table of data.tables){
      const button=document.createElement('button');button.textContent=`${table.type==='view'?'◇ ':'▤ '}${table.name}`;
      button.type='button';button.classList.toggle('active',state.table===table.name);
      button.addEventListener('click',()=>{state.table=table.name;state.page=0;for(const b of list.children)b.classList.remove('active');button.classList.add('active');browse();});
      list.append(button);
    }
    if(state.table&&!data.tables.some(t=>t.name===state.table)){state.table='';state.tableInfo=null;$('table-grid').replaceChildren();}
    if(!state.table&&data.tables.length){list.firstChild.click();}
    await loadQueries();
  }catch(e){status(e.message,true);}
}
async function databases(){
  try{
    const {databases}=await api('/databases');
    const select=$('db-picker'),prior=state.database;select.replaceChildren();
    if(!databases.length){status('No project SQLite files found. Generate one with npm run ingest:etcs.',true);return;}
    for(const database of databases){const option=document.createElement('option');option.value=database;option.textContent=database;select.append(option);}
    state.database=databases.includes(prior)?prior:databases[0];select.value=state.database;
    await tables();
  }catch(e){status(`${e.message}. Database console requires npm start, not preview mode.`,true);}
}
async function loadQueries(){
  try{
    const {queries}=await api('/queries');state.queries=queries;
    const picker=$('saved-queries'),selected=picker.value;picker.replaceChildren();
    const prompt=document.createElement('option');prompt.textContent='Select a saved query…';prompt.value='';picker.append(prompt);
    for(const q of queries){
      const option=document.createElement('option');option.value=q.id;option.textContent=`${q.name} · ${q.count} calls · ${q.lastCalled?new Date(q.lastCalled).toLocaleString():'never'} [${q.database}]`;picker.append(option);
    }
    picker.value=queries.some(q=>q.id===selected)?selected:'';
  }catch(e){status(e.message,true,'sql-status');}
}
$('db-picker').addEventListener('change',async()=>{state.database=$('db-picker').value;state.table='';state.page=0;await tables();});
$('db-refresh').addEventListener('click',databases);
$('page-prev').addEventListener('click',()=>{state.page=Math.max(0,state.page-1);browse();});
$('page-next').addEventListener('click',()=>{state.page++;browse();});
$('db-add').addEventListener('click',async()=>{
  if(!state.table)return;
  try{
    const record=JSON.parse($('new-row-json').value||'{}');
    const result=await api('/rows',{method:'POST',body:{database:state.database,table:state.table,record}});
    status(`Inserted ${result.changes} new row`);$('new-row-json').value='';await browse();
  }catch(e){status(e.message,true);}
});
$('db-delete').addEventListener('click',async()=>{
  if(!state.selected||!window.confirm(`Permanently delete the selected row from ${state.table}?`))return;
  try{
    await api('/rows',{method:'DELETE',body:{database:state.database,table:state.table,original:original(state.selected)}});
    await browse();status('Row deleted');
  }catch(e){status(e.message,true);}
});
$('sql-play').addEventListener('click',async()=>{
  const sqlText=editor.state.doc.toString().trim();
  if(!sqlText||!state.database)return;
  try{
    const result=await api('/query',{method:'POST',body:{database:state.database,sql:sqlText}});
    if(state.resultGrid)state.resultGrid.destroy();
    state.resultGrid=grid($('sql-results'),result.rows,result.columns);
    status(result.columns.length?`${result.rows.length} result rows${result.truncated?' (showing first 500)':''}`:`Executed · ${result.changes} row(s) changed`,false,'sql-status');
    await tables();await loadQueries();
  }catch(e){status(e.message,true,'sql-status');await loadQueries();}
});
$('saved-queries').addEventListener('change',async()=>{
  const q=state.queries.find(q=>q.id===$('saved-queries').value);
  if(!q)return;
  setSQL(q.sql);$('query-name').value=q.name;
  if(state.database!==q.database){state.database=q.database;$('db-picker').value=q.database;state.table='';state.page=0;await tables();}
});
$('save-query-name').addEventListener('click',async()=>{
  const id=$('saved-queries').value;if(!id)return status('Select a saved query to rename',true,'sql-status');
  try{await api(`/queries/${encodeURIComponent(id)}`,{method:'PATCH',body:{name:$('query-name').value}});await loadQueries();$('saved-queries').value=id;status('Query renamed',false,'sql-status');}
  catch(e){status(e.message,true,'sql-status');}
});
databases();
